import { tileCoordToPixelCoord } from "@latticexyz/phaserx";
import {
  Entity,
  Has,
  defineEnterSystem,
  getComponentValueStrict,
} from "@latticexyz/recs";
import { waitForTransaction } from "@wagmi/core";
import { getUnixTime } from "date-fns";
import { BigNumber } from "ethers";
import { formatEther } from "ethers/lib/utils";
import { Address } from "viem";
import { Assets, TILE_HEIGHT, TILE_WIDTH } from "../constants";
import { PhaserLayer } from "../createPhaserLayer";
import {
  InteractiveEvent,
  getInteractiveTile,
} from "../utils/InteractriveObjectUtils";
import { RealTimeBalance } from "../utils/StreamStore";
import Decimal from "decimal.js";

export const createInteractiveSystem = (layer: PhaserLayer) => {
  const {
    playerLocation,
    superfluid: { framework, streamStore },
    world,
    scenes: {
      Main: { objectPool, phaserScene, camera },
    },
    networkLayer: {
      playerEntityId,
      network: {
        network: { signer },
      },
      systemCalls: { setSapphireStream },
      components: { Position, SFStoreTable, SFSuperTokenTable },
      playerEntity,
    },
  } = layer;

  let sapphireRTB = streamStore.realtimeBalances.get("SPHR");
  let blueRTB = streamStore.realtimeBalances.get("Blue");

  streamStore.realtimeBalanceObservable.subscribe((realTimeBalance) => {
    const { token, ...rtb } = realTimeBalance;

    switch (token) {
      case "SPHR":
        sapphireRTB = rtb;
        break;
      case "Blue":
        blueRTB = rtb;
    }
  });

  const token1 = addTokenText("0", 490, -183);
  const token2 = addTokenText("0", 490, -132);
  const token3 = addTokenText("0", 490, -75);

  setInterval(() => {
    if (sapphireRTB) {
      const newBalance = calculateRealtimeBalance(sapphireRTB);
      const formattedBalance = new Decimal(formatEther(newBalance));
      // decimal.toDP()
      // utils.formatFixed(formatEther(newBalance.toString()), 10)
      token1.setText(formattedBalance.toDP(5).toString());
    }

    if (blueRTB) {
      const newBalance = calculateRealtimeBalance(blueRTB);
      token2.setText(formatEther(newBalance.toString()));
    }
  }, 500);

  function calculateRealtimeBalance(rtb: RealTimeBalance): BigNumber {
    const { balance, flowRate, timestamp } = rtb;
    const unixNow = getUnixTime(new Date());

    return BigNumber.from(balance).add(
      BigNumber.from(unixNow - timestamp).mul(BigNumber.from(flowRate))
    );
  }

  function addTokenText(label: string, x: number, y: number) {
    return phaserScene.add
      .text(
        phaserScene.cameras.main.width / 2 + x,
        phaserScene.cameras.main.height / 2 + y,
        label,
        {
          color: "#734C44",
          fontSize: "32px",
          fontFamily: "VT323",
        }
      )
      .setOrigin(1, 0.5)
      .setDepth(21)
      .setVisible(false)
      .setScrollFactor(0);
  }

  const inventoryButton = phaserScene.add
    .image(phaserScene.cameras.main.width - 178, 0, Assets.InventoryBtn)
    .setOrigin(0, 0)
    .setDepth(18)
    .setScrollFactor(0)
    .setInteractive()
    .on("pointerdown", () => {
      toggleInventory();
    });

  const backdrop = phaserScene.add
    .rectangle(
      0,
      0,
      phaserScene.cameras.main.width,
      phaserScene.cameras.main.height,
      0,
      0.5
    )
    .setScrollFactor(0)
    .setDepth(19)
    .setOrigin(0, 0);

  const introDialog = addDialog(Assets.Intro, () => {
    introDialog.setVisible(false);
    backdrop.setVisible(false);
  })
    .setVisible(true)
    .setScrollFactor(0);

  const bookDialog = addDialog(Assets.Book, () => {
    toggleInventory();
  }).setScrollFactor(0);

  const storeDialog = addTooltip(Assets.Store, 24, 8, startExchange);
  const mineDialog = addTooltip(Assets.Mine, 26, 30, startMining);
  const nftDialog = addTooltip(Assets.NFT, 44, 13, mintNFT);
  const caveDialog = addTooltip(Assets.Cave, 3, 13, enterCave);

  playerLocation.subscribe((newLocation) => {
    const action = getInteractiveTile(newLocation.x, newLocation.y);

    switch (action?.event) {
      case InteractiveEvent.StartMining:
        mineDialog.setVisible(true);
        break;
      case InteractiveEvent.StartExchange:
        storeDialog.setVisible(true);
        break;
      case InteractiveEvent.MintNFT:
        nftDialog.setVisible(true);
        break;
      case InteractiveEvent.EnterCave:
        caveDialog.setVisible(true);
        break;
      default:
        mineDialog.setVisible(false);
        storeDialog.setVisible(false);
        nftDialog.setVisible(false);
        caveDialog.setVisible(false);
    }
  });

  let showInventory = false;

  function toggleInventory() {
    showInventory = !showInventory;

    if (showInventory) {
      backdrop.setVisible(true);
      bookDialog.setVisible(true);
      token1.setVisible(true);
      token2.setVisible(true);
      token3.setVisible(true);
    } else {
      backdrop.setVisible(false);
      bookDialog.setVisible(false);
      token1.setVisible(false);
      token2.setVisible(false);
      token3.setVisible(false);
    }
  }
  function addTooltip(
    image: string,
    x: number,
    y: number,
    onClick: () => void
  ) {
    const pixelCoordinates = tileCoordToPixelCoord(
      { x, y },
      TILE_WIDTH,
      TILE_HEIGHT
    );
    return phaserScene.add
      .image(pixelCoordinates.x, pixelCoordinates.y, image)
      .setOrigin(0, 0)
      .setDepth(15)
      .setInteractive()
      .setVisible(false)
      .on("pointerdown", onClick);
  }

  function addDialog(image: string, onClick: () => void) {
    return phaserScene.add
      .image(
        phaserScene.cameras.main.width / 2,
        phaserScene.cameras.main.height / 2,
        image
      )
      .setDepth(20)
      .setInteractive()
      .setVisible(false)
      .on("pointerdown", onClick);
  }

  async function mintNFT() {
    const nftBuilding = getComponentValueStrict(
      SFSuperTokenTable,
      "0x03" as Entity
    );

    const signerToUse = signer.get();
    if (!nftBuilding || !signerToUse) return;

    const myAddress = await signerToUse.getAddress();
    if (!myAddress) return;

    const superToken = await framework.loadSuperToken("Blue");

    const transactionResult = await superToken
      .createFlow({
        flowRate: "500000000",
        receiver: nftBuilding.superTokenAddress,
        overrides: {
          gasPrice: "0",
        },
      })
      .exec(signerToUse);

    console.log("Waiting for transaction");
    await waitForTransaction({
      hash: transactionResult.hash as Address,
    });
    console.log("Transaction went through");
    // This can be async
    streamStore.loadRealTimeBalance("SPHR");

    phaserScene.add
      .sprite(46, 21, Assets.Crystals, 5)
      .setOrigin(0, 0)
      .setDepth(1);
  }

  async function startExchange() {
    const storeData = getComponentValueStrict(SFStoreTable, "0x01" as Entity);
    const signerToUse = signer.get();
    if (!storeData || !signerToUse || !playerEntityId) return;

    const superToken = await framework.loadSuperToken("SPHR");

    const transactionResult = await superToken
      .createFlow({
        flowRate: "5000000000000",
        receiver: storeData.storeAddress,
        overrides: {
          gasPrice: "0",
        },
      })
      .exec(signerToUse);

    console.log("Waiting for transaction");
    await waitForTransaction({
      hash: transactionResult.hash as Address,
    });
    console.log("Transaction went through");
    // Updating real time balances for the tokens
    streamStore.loadRealTimeBalance("SPHR");
    streamStore.loadRealTimeBalance("Blue");
  }

  async function startMining() {
    try {
      await setSapphireStream();
    } catch (e) {
      if(e.message.includes("0x801b6863")) {
        console.log("Player Already has a stream");
      }
    } finally {
      // TODO: This is a hacky way, how to get callback?
      console.log("Fetching SPHR");
      setTimeout(() => {
        streamStore.loadRealTimeBalance("SPHR");
      }, 2000);
    }


  }

  async function enterCave() {
    console.log("WHOOOOOO YOUR ARE AMAZING!!!");
  }

  defineEnterSystem(world, [Has(Position)], ({ entity }) => {
    if (playerEntity === entity) {
      const playerSprite = objectPool.get(entity, "Sprite");
      const userSprite = phaserScene.children.getByName(
        `player-${playerSprite.id}`
      );
      console.log("Found user sprite, adding callback");
      if (userSprite) {
        console.log("Adding callback");
        userSprite.on(
          "changedata",
          (...args: any) => {
            console.log("HANDLING CALLBACK", args);
          },
          phaserScene
        );
      }
    }
  });
};

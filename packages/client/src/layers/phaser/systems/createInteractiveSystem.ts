import { Entity, getComponentValueStrict } from "@latticexyz/recs";
import { waitForTransaction } from "@wagmi/core";
import { getUnixTime } from "date-fns";
import Decimal from "decimal.js";
import { formatEther } from "ethers/lib/utils";
import { Address } from "viem";
import { Animations, Assets } from "../constants";
import { PhaserLayer } from "../createPhaserLayer";
import {
  InteractiveEvent,
  getInteractiveTile,
} from "../utils/InteractriveObjectUtils";
import { buildDialog, buildTooltip } from "../utils/PhaserUtils";
import { TokenRealtimeBalance } from "../utils/StreamStore";
import { calculateRealtimeBalance } from "../utils/StreamUtils";

export const createInteractiveSystem = (layer: PhaserLayer) => {
  const {
    playerLocation,
    superfluid: { framework, streamStore, provider },
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

  let showInventory = false;
  let isMining = sapphireRTB && sapphireRTB.flowRate !== "0";

  streamStore.realtimeBalanceObservable.subscribe(
    (rtb: TokenRealtimeBalance) => {
      if (rtb.token === "SPHR") {
        if (rtb.flowRate !== "0") {
          isMining = true;

          if (mineTooltip.visible) {
            mineTooltip.setVisible(false);
            mineActiveTooltip.setVisible(true);
          }
        } else {
          isMining = false;
        }
      }
    }
  );

  const nftBuilding = getComponentValueStrict(
    SFSuperTokenTable,
    "0x03" as Entity
  );

  if (playerEntityId) {
    streamStore.initNftTracking(nftBuilding.superTokenAddress);
  }

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

  const nftImage = phaserScene.add
    .image(
      phaserScene.cameras.main.width / 2 - 300,
      phaserScene.cameras.main.height / 2 + 40,
      Assets.Soldier,
      0
    )
    .setScale(2)
    .setOrigin(0, 0)
    .setDepth(21)
    .setVisible(false)
    .setScrollFactor(0);

  let evoInit = false;

  streamStore.nftEvo.subscribe((evo) => {
    if (evo !== null) {
      evoInit = true;
      nftImage.setFrame(evo).setVisible(showInventory);
      soldierLevel.setText(`Level ${evo}`).setVisible(showInventory);
    } else {
      nftImage.setVisible(false);
    }
  });

  const token1 = addAssetText("0", 490, -183);
  const token2 = addAssetText("0", 490, -132);
  const token3 = addAssetText("0", 490, -75);

  const potion1 = addAssetText("0", 490, 90);
  const potion2 = addAssetText("0", 490, 145);
  const potion3 = addAssetText("0", 490, 200);

  const soldierToken = phaserScene.add
    .text(
      phaserScene.cameras.main.width / 2 - 280,
      phaserScene.cameras.main.height / 2 + 180,
      "0",
      {
        color: "#734C44",
        fontSize: "40px",
        fontFamily: "VT323",
      }
    )
    .setOrigin(0.5, 0.5)
    .setDepth(21)
    .setVisible(false)
    .setScrollFactor(0);

  const soldierLevel = phaserScene.add
    .text(
      phaserScene.cameras.main.width / 2 - 280,
      phaserScene.cameras.main.height / 2 + 220,
      "",
      {
        color: "#734C44",
        fontSize: "36px",
        fontFamily: "VT323",
      }
    )
    .setOrigin(0.5, 0.5)
    .setDepth(21)
    .setVisible(false)
    .setScrollFactor(0);

  // Token streaming animations
  setInterval(() => {
    if (sapphireRTB) {
      const newBalance = calculateRealtimeBalance(sapphireRTB);
      const formattedBalance = new Decimal(formatEther(newBalance));
      token1.setText(formattedBalance.toDP(6).toString());
    }

    if (blueRTB) {
      const newBalance = calculateRealtimeBalance(blueRTB);
      const formattedBalance = new Decimal(formatEther(newBalance));
      potion1.setText(formattedBalance.toDP(6).toString());
    }

    if (streamStore.nftEvoStream) {
      const newBalance = calculateRealtimeBalance(streamStore.nftEvoStream);
      soldierToken.setText(formatEther(newBalance.toString()));
    }
  }, 500);

  function addAssetText(label: string, x: number, y: number) {
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

  // TODO: Will make this animate soon
  // const streamSprite = phaserScene.add
  //   .sprite(
  //     phaserScene.cameras.main.width / 2,
  //     phaserScene.cameras.main.height / 2,
  //     Assets.Stream,
  //     0
  //   )
  //   .setScrollFactor(0)
  //   .setDepth(19)
  //   .setOrigin(0, 0)
  //   .addToUpdateList()
  //   .play(Animations.StreamFlow);

  const introDialog = buildDialog(phaserScene, Assets.Intro, () => {
    introDialog.setVisible(false);
    backdrop.setVisible(false);
  }).setVisible(true);

  const inventoryDialog = buildDialog(phaserScene, Assets.Book, () => {
    toggleInventory();
  });

  const storeDialog = buildDialog(phaserScene, Assets.StoreEnter, () => {
    storeDialog.setVisible(false);
    backdrop.setVisible(false);
    startExchange();
  });

  const forgeDialog = buildDialog(phaserScene, Assets.ForgeEnter, () => {
    forgeDialog.setVisible(false);
    backdrop.setVisible(false);
    mintNFT();
  });

  const storeTooltip = buildTooltip(phaserScene, Assets.Store, 24, 8, () => {
    backdrop.setVisible(true);
    storeDialog.setVisible(true);
  });

  const mineTooltip = buildTooltip(phaserScene, Assets.Mine, 26, 30, () => {
    startMining();
  });

  const mineActiveTooltip = buildTooltip(
    phaserScene,
    Assets.MineActive,
    26,
    30,
    () => {
      console.log("Do nothing");
    }
  );

  const nftTooltip = buildTooltip(phaserScene, Assets.NFT, 44, 13, () => {
    backdrop.setVisible(true);
    forgeDialog.setVisible(true);
  });
  const caveTooltip = buildTooltip(phaserScene, Assets.Cave, 3, 13, enterCave);

  playerLocation.subscribe((newLocation) => {
    const action = getInteractiveTile(newLocation.x, newLocation.y);

    switch (action?.event) {
      case InteractiveEvent.StartMining: {
        isMining
          ? mineActiveTooltip.setVisible(true)
          : mineTooltip.setVisible(true);
        break;
      }
      case InteractiveEvent.StartExchange:
        storeTooltip.setVisible(true);
        break;
      case InteractiveEvent.MintNFT:
        nftTooltip.setVisible(true);
        break;
      case InteractiveEvent.EnterCave:
        caveTooltip.setVisible(true);
        break;
      default: {
        mineActiveTooltip.setVisible(false);
        mineTooltip.setVisible(false);
        storeTooltip.setVisible(false);
        nftTooltip.setVisible(false);
        caveTooltip.setVisible(false);
        storeDialog.setVisible(false);
        forgeDialog.setVisible(false);
        backdrop.setVisible(false);
      }
    }
  });

  function toggleInventory() {
    showInventory = !showInventory;
    if (showInventory) {
      backdrop.setVisible(true);
      inventoryDialog.setVisible(true);
      token1.setVisible(true);
      token2.setVisible(true);
      token3.setVisible(true);
      potion1.setVisible(true);
      potion2.setVisible(true);
      potion3.setVisible(true);
      nftImage.setVisible(evoInit);
      soldierToken.setVisible(true);
      soldierLevel.setVisible(true);
    } else {
      backdrop.setVisible(false);
      inventoryDialog.setVisible(false);
      token1.setVisible(false);
      token2.setVisible(false);
      token3.setVisible(false);
      potion1.setVisible(false);
      potion2.setVisible(false);
      potion3.setVisible(false);
      nftImage.setVisible(false);
      soldierToken.setVisible(false);
      soldierLevel.setVisible(false);
    }
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

    try {
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
      const rs = await waitForTransaction({
        hash: transactionResult.hash as Address,
      });

      // get token id from events:
      const contractLogs = rs.logs.filter(
        (log) => log.address === nftBuilding.superTokenAddress
      );
      const log = contractLogs[0];
      const topics = log.topics;
      const id = topics[3];
      console.log("id", Number(id));
      streamStore.nftEvo.next(Number(id));

      // streamStore.initNftTracking(nftBuilding.superTokenAddress);
      streamStore.nftEvoStream = {
        flowRate: "500000000",
        balance: "0",
        timestamp: getUnixTime(new Date()),
      };
      console.log("Transaction went through");
    } catch (e: any) {
      if (e.message.includes("0x801b6863")) {
        console.log("player already has a stream to NFT");
      }
    } finally {
      // This can be async
      streamStore.loadRealTimeBalance("SPHR");
    }

    phaserScene.add
      .sprite(46, 21, Assets.Crystals, 5)
      .setOrigin(0, 0)
      .setDepth(1);
  }

  // function startNFTEvo(currentEvo: number) {
  //   const newEvo = currentEvo + 1;

  //   streamStore.nftEvo.next(newEvo);

  //   if (newEvo <= 4) {
  //     setTimeout(() => {
  //       startNFTEvo(newEvo + 1);
  //     }, 10000);
  //   }
  // }

  async function startExchange() {
    const storeData = getComponentValueStrict(SFStoreTable, "0x01" as Entity);
    const signerToUse = signer.get();
    if (!storeData || !signerToUse || !playerEntityId) return;

    const superToken = await framework.loadSuperToken("SPHR");
    try {
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
    } catch (e: any) {
      if (e.message.includes("0x801b6863")) {
        console.log("player already has a stream to store");
      }
    } finally {
      // Updating real time balances for the tokens
      streamStore.loadRealTimeBalance("SPHR");
      streamStore.loadRealTimeBalance("Blue");
    }
  }

  async function startMining() {
    try {
      await setSapphireStream();
    } catch (e: any) {
      if (e.message.includes("0x801b6863")) {
        console.log("player already has a stream");
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
};

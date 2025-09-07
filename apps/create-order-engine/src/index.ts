import { Kafka } from "kafkajs";
import fs from "fs";
import {
  createOrder,
  calculateUnrealizedPnL,
  checkSlippage,
} from "./createOrder";

const kafka = new Kafka({
  clientId: "create-order",
  brokers: ["localhost:9092"],
});
const backpackConsumer = kafka.consumer({ groupId: "recieved-backpack-data" });
const tradeProducer = kafka.producer();

console.log("starting the engine 1");
export const createOrderData: Map<string, any> = new Map();
export const currentPrice: Map<string, number> = new Map();
export const activeOrders: Map<number, any> = new Map();
export const userData: Map<string, { balance: number }> = new Map();

const consumeBackpackMessages = async () => {
  await backpackConsumer.connect();
  await tradeProducer.connect();
  await backpackConsumer.subscribe({
    topic: "recieved-backpack-data",
    fromBeginning: true,
  });
  await backpackConsumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      if (!message.value) {
        throw new Error("message does nto exist");
      }

      if (message.value.toString()) {
        const value = JSON.parse(message.value.toString());

        if (value.data === "binance" && value.priceUpdatePayload) {
          value.priceUpdatePayload.price_updates.forEach(
            (update: { asset: string; price: number; decimal: number }) => {
              const adjustedPrice = update.price / Math.pow(10, update.decimal);
              currentPrice.set(update.asset, adjustedPrice);

              activeOrders.forEach((order) => {
                if (order.asset === update.asset) {
                  const updatedUnrealizedPnL = calculateUnrealizedPnL(
                    order.type,
                    order.quantity,
                    order.entryPrice,
                    adjustedPrice
                  );
                  order.unrealizedPnL = updatedUnrealizedPnL;
                  console.log(
                    `Order ${order.orderId} - Updated Unrealized PnL for ${order.asset}: ${updatedUnrealizedPnL}`
                  );
                }
              });
            }
          );
          console.log("Processed the backpack details:", currentPrice);
        }
        if (value.data === "trade") {
          const orderData = {
            userEmail: value.userEmail,
            asset: value.asset,
            type: value.type,
            margin: value.margin,
            leverage: value.leverage,
            slippage: value.slippage,
            requestPrice: value.requestPrice,
            requestTimestamp: value.requestTimestamp,
            userBalance: value.balance,
            requestId: value.requestId, // Pass requestId
          };
          userData.set(orderData.userEmail, { balance: orderData.userBalance });

          const assetCurrentPrice = currentPrice.get(orderData.asset);
          if (assetCurrentPrice !== undefined) {
            // Check slippage before creating order
            const isSlippageAcceptable = checkSlippage(
              orderData.type,
              orderData.requestPrice,
              assetCurrentPrice,
              orderData.slippage
            );

            if (!isSlippageAcceptable) {
              console.warn(
                `Order rejected due to slippage. Asset: ${orderData.asset}, ` +
                  `Request Price: ${orderData.requestPrice}, Current Price: ${assetCurrentPrice}, ` +
                  `Slippage: ${orderData.slippage}`
              );
              return;
            }

            const newOrder = createOrder({
              ...orderData,
              currentPrice: assetCurrentPrice,
            });

            
            if (newOrder) {
              activeOrders.set(newOrder.orderId, newOrder);
              console.log("reached here");
              console.log("Processed the trades details:", createOrderData);
              console.log("New Order Created and Stored:", newOrder);
            }
            await tradeProducer.send({
              topic: "trade-data",
              messages: [
                {
                  value: JSON.stringify(newOrder),
                },
              ],
            });
          } else {
            console.warn(
              `Current price for asset ${orderData.asset} not available. Order not created.`
            );
          }
        }
      }
    },
  });
};

consumeBackpackMessages().catch(console.error);

setInterval(() => {
  const snapshotFilePath = "snapshots.json";

  fs.readFile(snapshotFilePath, "utf8", (err, data) => {
    let snapshots = [];
    if (!err && data) {
      try {
        snapshots = JSON.parse(data);
        if (!Array.isArray(snapshots)) {
          snapshots = [];
        }
      } catch (e) {
        snapshots = [];
      }
    }
    for (const [userEmail, userDataValue] of userData.entries()) {
      const userOrders = Array.from(activeOrders.values()).filter(
        (order) => order.userEmail === userEmail
      );
      const existingSnapshotIndex = snapshots.findIndex(
        (snap) => snap.userId === userEmail
      );

      const newSnapshot = {
        userId: userEmail,
        balance: userDataValue.balance,
        openOrders: userOrders,
        prices: Object.fromEntries(currentPrice.entries()),
        timestamp: new Date().toISOString(),
      };

      if (existingSnapshotIndex !== -1) {
        snapshots[existingSnapshotIndex] = newSnapshot;
      } else {
        snapshots.push(newSnapshot);
      }
    }

    fs.writeFile(
      snapshotFilePath,
      JSON.stringify(snapshots, null, 2),
      (err) => {
        if (err) {
          console.error("Error writing snapshot to file:", err);
        } else {
          console.log("Successfully updated snapshots.json");
        }
      }
    );
  });
}, 10000);

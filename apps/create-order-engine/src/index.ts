import { Kafka } from "kafkajs";
import { createOrder, calculateUnrealizedPnL } from "./createOrder"; 

const kafka = new Kafka({
  clientId: "create-order",
  brokers: ["localhost:9092"],
});
const backpackConsumer = kafka.consumer({ groupId: "recieved-backpack-data" });


console.log("starting the engine 1");
export const createOrderData: Map<string, any> = new Map();
export const currentPrice: Map<string, number> = new Map();
export const activeOrders: Map<number, any> = new Map(); 

const consumeBackpackMessages = async () => {
  await backpackConsumer.connect();
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

              activeOrders.forEach(order => {
                if (order.asset === update.asset) {
                  const updatedUnrealizedPnL = calculateUnrealizedPnL(
                    order.type,
                    order.quantity,
                    order.priceForSlippag,
                    adjustedPrice
                  );
                  order.unrealizedPnL = updatedUnrealizedPnL;
                  console.log(`Order ${order.orderId} - Updated Unrealized PnL for ${order.asset}: ${updatedUnrealizedPnL}`);
                }
              });
            }
          );
          console.log("Processed the backpack details:", currentPrice);
        }
        if (value.data === "trade") {
          const orderData = {
            asset: value.asset,
            type: value.type,
            margin: value.margin,
            leverage: value.leverage,
            slippage: value.slippage,
            priceForSlippag: value.priceForSlippag,
            userBalance: value.balance, 
          };

          const assetCurrentPrice = currentPrice.get(orderData.asset);

          if (assetCurrentPrice !== undefined) {
            const newOrder = createOrder({ ...orderData, currentPrice: assetCurrentPrice });
            activeOrders.set(newOrder!.orderId, newOrder);
            console.log("Processed the trades details:", createOrderData); 
            console.log("New Order Created and Stored:", newOrder);
          } else {
            console.warn(`Current price for asset ${orderData.asset} not available. Order not created.`);
          }
        }
      }
    },
  });
};

consumeBackpackMessages().catch(console.error);

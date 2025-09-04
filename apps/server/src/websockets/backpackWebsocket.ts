import Websocket, { RawData } from "ws";
import { redis } from "../lib/redisClient";

export const fetchBackpackData = async (symbols: string[]) => {
  const url = "wss://ws.backpack.exchange/";
  const ws = new Websocket(url);

  ws.on("open", () => {
    console.log(" Websocket connected to Backpack");

    symbols.forEach((symbol, i) => {
      const market = symbol.endsWith("_USDC") ? symbol : `${symbol}_USDC`;

      const subscriptionMessage = {
        method: "SUBSCRIBE",
        params: [`trade.${market}`],
        id: i + 1,
      };

      console.log(" Subscribing with:", subscriptionMessage);
      ws.send(JSON.stringify(subscriptionMessage));
    });
  });

  ws.on("message", async (data: RawData) => {
    try {
      const parsedData = JSON.parse(data.toString());
      console.log(" Received:", parsedData);

      if (parsedData.data) {
        const d = parsedData.data;

        const asset = d.s.replace("_USDC", "");
        const priceStr = d.p;
        const decimal = priceStr.includes(".")
          ? priceStr.split(".")[1].length
          : 0;
        const scaledPrice = Math.round(
          parseFloat(priceStr) * Math.pow(10, decimal)
        );

        const priceUpdatePayload = {
          price_updates: [
            {
              asset,
              price: scaledPrice,
              decimal,
            },
          ],
        };
        redis.publish("backpack:payload", JSON.stringify(priceUpdatePayload));
        console.log('publised')
      }
    } catch (error: any) {
      console.error(" Error processing message:", error);
    }
  });

  ws.on("error", (error: Error) => {
    console.error(" Websocket error:", error);
  });

  ws.on("close", () => {
    console.log("Backpack websocket closed");
  });
};

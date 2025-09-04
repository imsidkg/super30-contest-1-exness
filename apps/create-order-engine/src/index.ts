  import { Redis } from "ioredis";
  import { Kafka } from "kafkajs";
  const kafka = new Kafka({
    clientId: "create-order",
    brokers: ["localhost:9092"],
  });
  const consumer = kafka.consumer({ groupId: "recieved-backpack-data" });

  const redis = new Redis();
  console.log("starting the engine 1");
  const dataFromStreamPublisher: Map<string, number> = new Map();
  redis.subscribe("backpack:payload");
  redis.on("message", (channel, message) => {
    const parsed = JSON.parse(message);
    if (parsed.price_updates && Array.isArray(parsed.price_updates)) {
      parsed.price_updates.forEach(
        (update: { asset: string; price: number; decimal: number }) => {
          const adjustedPrice = update.price / Math.pow(10, update.decimal);
          dataFromStreamPublisher.set(update.asset, adjustedPrice);
        }
      );
    }

    // console.log(dataFromStreamPublisher);
  });

  const consumeMessages = async () => {
    await consumer.connect();
    await consumer.subscribe({ topic: "recieved-backpack-data", fromBeginning: true });
    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        if (!message.value) {
          throw new Error("message does nto exist");
        }
        console.log(`Processed: ${message.value.toString()}`);
      },
    });
  };

  consumeMessages().catch(console.error);

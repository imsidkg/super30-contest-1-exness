import express from "express";
import nodemailer from "nodemailer";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import { fetchBackpackData } from "./websockets/backpackWebsocket";
import { Kafka } from "kafkajs";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "./lib/prisma";
import { redis } from "./lib/redisClient";
const pendingOrderRequests = new Map<
  string,
  { resolve: (value: any) => void; reject: (reason?: any) => void }
>();

export const currentPrices: Map<string, { price: number; timestamp: number }> =
  new Map();

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

export const kafka = new Kafka({
  clientId: "create-order",
  brokers: ["localhost:9092"],
});

const producer = kafka.producer();
const tradeConsumer = kafka.consumer({ groupId: "recieved-trade-data" });
const balanceResponseConsumer = kafka.consumer({ groupId: "balance-response" });

app.use(express.json());
app.use(cookieParser());

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

app.post("/signup", async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).send("Email is required");
  }

  const token = jwt.sign({ email }, process.env.JWT_SECRET as string, {
    expiresIn: "1h",
  });
  const magicLink = `${process.env.BASE_URL}/verify?token=${token}`;

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Your Magic Link",
      html: `<p>Click <a href="${magicLink}">here</a> to log in.</p>`,
    });

    res.send("Magic link sent to your email");
  } catch (error) {
    console.error("Error sending email:", error);
    res.status(500).send("Error sending magic link");
  }
});

app.get("/verify", async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(400).send("Token is required");
  }

  try {
    const decoded = jwt.verify(
      token as string,
      process.env.JWT_SECRET as string
    ) as { email: string };
    const userEmail = decoded.email;

    let user = await prisma.user.findFirst({
      where: { email: userEmail },
    });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: userEmail,
        },
      });
    }
    res.cookie("auth_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    });
    res.redirect("/profile");
  } catch (error) {
    res.status(401).send("Invalid or expired token");
  }
});

type User = {
  email: string;
  balance: number;
};

const authenticateToken = async (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  const token = req.cookies.auth_token;

  if (!token) {
    return res.status(401).send("Access Denied: No Token Provided");
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as {
      email: string;
    };
    const userEmail = decoded.email;

    const balance = await redis.get(`user:${userEmail}:balance`);

    res.locals.user = {
      email: userEmail,
      balance: balance ? parseInt(balance) : 0,
    } as User;
    next();
  } catch (error) {
    res.status(403).send("Invalid Token");
  }
};

app.get("/profile", authenticateToken, (req, res) => {
  const user = res.locals.user as User;
  res.send(`Welcome to your profile! Your balance is: ${user.balance}`);
});

app.post("/api/v1/trade/create", authenticateToken, async (req, res) => {
  const { asset, type, margin, leverage, slippage } = req.body;
  const user = res.locals.user as User;

  if (!user || !user.email) {
    return res.status(401).send("User not authenticated.");
  }

  const currentPriceData = currentPrices.get(asset);
  if (!currentPriceData) {
    return res.status(400).send(`Current price not available for ${asset}`);
  }

  const requestId = uuidv4();

  const orderPromise = new Promise((resolve, reject) => {
    pendingOrderRequests.set(requestId, { resolve, reject });
  });

  await producer.send({
    topic: "recieved-backpack-data",
    messages: [
      {
        value: JSON.stringify({
          data: "trade",
          asset,
          type,
          margin,
          leverage,
          slippage,
          requestPrice: currentPriceData.price,
          requestTimestamp: currentPriceData.timestamp,
          balance: user.balance,
          userEmail: user.email,
          requestId: requestId,
        }),
      },
    ],
  });

  try {
    const orderId = await orderPromise;
    res.status(200).json({ success: true, orderId: orderId });
  } catch (error) {
    console.error("Error processing order:", error);
    res.status(500).json({ success: false, message: "Error processing order" });
  } finally {
    pendingOrderRequests.delete(requestId);
  }
});

app.post("/api/v1/close", authenticateToken, async (req, res) => {
  const { orderId } = req.body;

  const requestId = uuidv4();
  const orderPromise = new Promise((resolve, reject) => {
    pendingOrderRequests.set(requestId, { resolve, reject });
  });

  producer.send({
    topic: "close-order-data",
    messages: [
      {
        value: JSON.stringify({
          orderId,
          data: "close-trade",
          requestId,
          liquidated: false,
        }),
      },
    ],
  });
  try {
    const closedOrder = await orderPromise;
    res.status(200).json({ success: true, orderId: closedOrder });
  } catch (error) {
    console.error("Error closing order:", error);
    res.status(500).json({ success: false, message: "Error closing order" });
  } finally {
    pendingOrderRequests.delete(requestId);
  }
});

app.get("/api/v1/balance/usd", authenticateToken, (req, res) => {
  const user = res.locals.user as User;
  res.json({ balance: user.balance });
});

app.get("/api/v1/balance", authenticateToken, async (req, res) => {
  const user = res.locals.user as User;
  const requestId = uuidv4();

  const balancePromise = new Promise((resolve, reject) => {
    pendingOrderRequests.set(requestId, { resolve, reject });

    setTimeout(() => {
      if (pendingOrderRequests.has(requestId)) {
        pendingOrderRequests.delete(requestId);
        resolve({});
      }
    }, 5000);
  });

  await producer.send({
    topic: "query-open-orders",
    messages: [
      {
        value: JSON.stringify({
          data: "query-open-orders",
          userEmail: user.email,
          requestId: requestId,
        }),
      },
    ],
  });

  try {
    const openOrders = await balancePromise;
    res.json(openOrders);
  } catch (error) {
    console.error("Error fetching open orders:", error);
    res.status(500).json({ error: "Failed to fetch open orders" });
  } finally {
    pendingOrderRequests.delete(requestId);
  }
});

app.get("/api/v1/supportedAssets", (req, res) => {
  res.json({
    assets: [
      {
        symbol: "BTC",
        name: "Bitcoin",
        imageUrl: "https://cryptologos.cc/logos/bitcoin-btc-logo.png",
      },
      {
        symbol: "SOL",
        name: "Solana",
        imageUrl: "https://cryptologos.cc/logos/solana-sol-logo.png",
      },
      {
        symbol: "ETH",
        name: "Ethereum",
        imageUrl: "https://cryptologos.cc/logos/ethereum-eth-logo.png",
      },
    ],
  });
});

app.listen(port, async () => {
  console.log(`Server running on http://localhost:${port}`);

  try {
    await producer.connect();
    console.log("Kafka producer connected");
    await tradeConsumer.connect();
    await balanceResponseConsumer.connect();
    await tradeConsumer.subscribe({
      topics: ["trade-data", "closed-trade-notifications"],
      fromBeginning: true,
    });
    await balanceResponseConsumer.subscribe({
      topic: "open-orders-response",
      fromBeginning: true,
    });
    await tradeConsumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        if (message.value) {
          const orderData = JSON.parse(message.value.toString());
          const requestId = orderData.requestId;
          if (orderData.data === "trade") {
            if (pendingOrderRequests.has(requestId)) {
              const { resolve } = pendingOrderRequests.get(requestId)!;
              resolve(orderData.orderId);
            }
          } else if (orderData.data === "trade-closed-confirmation") {
            if (pendingOrderRequests.has(requestId)) {
              const { resolve } = pendingOrderRequests.get(requestId)!;

              resolve(orderData.orderId);
            }
            if (orderData.userEmail && orderData.updatedBalance !== undefined) {
              await redis.set(
                `user:${orderData.userEmail}:balance`,
                orderData.updatedBalance.toString()
              );
            }

            try {
              const {
                openPrice,
                closePrice,
                leverage,
                pnl,
                assetSymbol,
                liquidated,
                userEmail,
              } = orderData;

              const user = await prisma.user.findFirst({
                where: { email: userEmail },
                select: { id: true },
              });

              let asset = await prisma.asset.findUnique({
                where: { symbol: assetSymbol },
                select: { id: true },
              });

              if (!asset) {
                console.log(`Asset ${assetSymbol} not found. Creating it.`);
                try {
                  asset = await prisma.asset.create({
                    data: {
                      symbol: assetSymbol,
                      name: assetSymbol,
                      imageUrl: "",
                      decimals: 0,
                    },
                    select: { id: true },
                  });
                } catch (e) {
                  console.error(`Failed to create asset ${assetSymbol}`, e);
                  asset = await prisma.asset.findUnique({
                    where: { symbol: assetSymbol },
                    select: { id: true },
                  });
                }
              }

              if (user && asset) {
                await prisma.existingTrade.create({
                  data: {
                    openPrice: parseFloat(openPrice),
                    closePrice: parseFloat(closePrice),
                    leverage: parseFloat(leverage),
                    pnl: parseFloat(pnl),
                    asset: { connect: { id: asset.id } },
                    liquidated: liquidated,
                    user: { connect: { id: user.id } },
                  },
                });
                console.log("Closed trade saved to Prisma:", orderData);
              } else {
                console.error(
                  "User or Asset not found for closed trade:",
                  orderData
                );
              }
            } catch (error) {
              console.error("Error saving closed trade to Prisma:", error);
            }
          }
        }
      },
    });

    await balanceResponseConsumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        if (message.value) {
          const responseData = JSON.parse(message.value.toString());
          if (responseData.data === "open-orders-response") {
            const requestId = responseData.requestId;
            if (pendingOrderRequests.has(requestId)) {
              const { resolve } = pendingOrderRequests.get(requestId)!;
              resolve(responseData.balances);
            }
          }
        }
      },
    });
  } catch (err) {
    console.error(" Failed to connect Kafka producer", err);
    process.exit(1);
  }

  fetchBackpackData(["SOL"]);

  process.on("SIGINT", async () => {
    console.log("Disconnecting Kafka producer...");
    await producer.disconnect();
    await tradeConsumer.disconnect();
    process.exit(0);
  });
});

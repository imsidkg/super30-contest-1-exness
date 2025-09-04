import express from "express";
import nodemailer from "nodemailer";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import { fetchBackpackData } from "./websockets/backpackWebsocket";
import { Kafka } from "kafkajs";
import { redis } from "./lib/redisClient";

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

export const kafka = new Kafka({
  clientId: "create-order",
  brokers: ["localhost:9092"],
});

const producer = kafka.producer();

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

    const balance = await redis.get(`user:${userEmail}:balance`);
    if (balance === null) {
      await redis.set(`user:${userEmail}:balance`, "5000");
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

// Define a User type
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

app.post("/api/v1/trade/createa", authenticateToken, async (req, res) => {
  const { asset, type, margin, leverage, slippage, priceForSlippag } = req.body;
  const user = res.locals.user as User;
  await producer.connect();
  if (!user || !user.email) {
    return res.status(401).send("User not authenticated.");
  }

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
          priceForSlippag,
          balance: user.balance,
          userEmail: user.email,
        }),
      },
    ],
  });


  
  res.status(200).json({ success: true, message: "Trade request submitted" });
});

app.listen(port, async () => {
  console.log(`Server running on http://localhost:${port}`);

  try {
    await producer.connect();
    console.log("Kafka producer connected");
  } catch (err) {
    console.error(" Failed to connect Kafka producer", err);
    process.exit(1);
  }

  fetchBackpackData(["SOL"]);

  process.on("SIGINT", async () => {
    console.log("Disconnecting Kafka producer...");
    await producer.disconnect();
    process.exit(0);
  });
});

import express from 'express';
import nodemailer from 'nodemailer';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { fetchBackpackData } from './websockets/backpackWebsocket';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

app.use(express.json());
app.use(cookieParser());

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

app.post('/signup', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).send('Email is required');
  }

  const token = jwt.sign({ email }, process.env.JWT_SECRET as string, { expiresIn: '1h' });
  const magicLink = `${process.env.BASE_URL}/verify?token=${token}`;

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Your Magic Link',
      html: `<p>Click <a href="${magicLink}">here</a> to log in.</p>`,
    });
    res.send('Magic link sent to your email');
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).send('Error sending magic link');
  }
});

app.get('/verify', (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(400).send('Token is required');
  }

  try {
    const decoded = jwt.verify(token as string, process.env.JWT_SECRET as string);
    res.cookie('auth_token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production' });
    res.redirect('/profile');
  } catch (error) {
    res.status(401).send('Invalid or expired token');
  }
});

const authenticateToken = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const token = req.cookies.auth_token;

  if (!token) {
    return res.status(401).send('Access Denied: No Token Provided');
  }

  try {
    jwt.verify(token, process.env.JWT_SECRET as string);
    next();
  } catch (error) {
    res.status(403).send('Invalid Token');
  }
};

app.get('/profile', authenticateToken, (req, res) => {
  res.send('Welcome to your profile!');
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
  fetchBackpackData(['SOL']);
});
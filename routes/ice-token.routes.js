// routes/iceToken.js
import express from 'express';
import twilio from 'twilio';
const router = express.Router();

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

router.get('/', async (req, res) => {
  try {
    const token = await client.tokens.create();
    res.json({ iceServers: token.iceServers });
  } catch (error) {
    console.error('Lỗi tạo ICE token:', error);
    res.status(500).json({ error: 'Không thể tạo ICE token' });
  }
});

export default router;

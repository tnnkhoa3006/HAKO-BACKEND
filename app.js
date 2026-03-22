import 'dotenv/config';
import express from 'express';
import dotenv from 'dotenv';
import http from 'http';
import applyMiddlewares from './middlewares/cors.middleware.js';
import connectDB from './config/db.config.js';
import routes from './routes/index.routes.js';
import { initSocket } from './middlewares/socket.middleware.js';
import cron from 'node-cron';
import { archiveExpiredStories } from './helper/ScanStory.js';
import compression from './middlewares/compression.middleware.js';
import helmet from './middlewares/helmet.middleware.js';
import cache from './middlewares/cache.middleware.js';
import { setServers } from "node:dns/promises";
setServers(["1.1.1.1", "8.8.8.8"]);


dotenv.config();

const app = express();
const server = http.createServer(app);

// Khởi tạo Socket.IO
initSocket(server);

// Kết nối database
connectDB();

// Áp dụng middleware
applyMiddlewares(app);
app.use(helmet());
app.use(compression());
// app.use(cache('2 minutes'));
// Đã tắt cache toàn cục để các route luôn trả về dữ liệu mới nhất

// Chỉ parse JSON cho các method có body
app.use((req, res, next) => {
  if (["POST", "PUT", "PATCH"].includes(req.method)) {
    express.json()(req, res, next);
  } else {
    next();
  }
});

// Áp dụng routes
app.use(routes);

// Route test
app.get('/', (req, res) => {
  res.send('API HAKO đang hoạt động');
});

app.head('/', (req, res) => {
  res.status(200).end();
});

// Đặt cron job để tự động archive story hết hạn mỗi phút
cron.schedule('* * * * *', async () => {
  await archiveExpiredStories();
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`🚀 Server đang chạy trên cổng ${PORT}`);
});

export default app;
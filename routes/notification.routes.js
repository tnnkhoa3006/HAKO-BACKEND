import express from 'express';
import { getNotifications, markAsRead } from '../controllers/notification.controller.js';
import { verifyToken } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Lấy danh sách thông báo
router.get('/', verifyToken, getNotifications);

// Đánh dấu đã đọc
router.post('/mark-as-read', verifyToken, markAsRead);

export default router;

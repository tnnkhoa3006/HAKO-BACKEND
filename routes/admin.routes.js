import express from 'express';
import multer from 'multer';
import { uploadMusic } from '../controllers/admin.controller.js';

const router = express.Router();

// Thêm cấu hình multer cho upload file nhạc
const upload = multer({ dest: 'temp/' });

// upload music
router.post('/upload', upload.single('media'), uploadMusic);

// // Xóa toàn bộ nhạc
// router.delete('/music/clear', clearAllStoryMusic);

// // Xóa nhạc theo id
// router.delete('/music/:publicId', deleteMusicById);

export default router;
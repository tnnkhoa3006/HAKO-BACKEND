import express from 'express';
import {
  deleteUser,
  getUser,
  uploadAvatar,
  deleteAvatar,
  updateBio,
  toggleFollowUser,
  getFollowing,
  getFollowers
} from '../controllers/user.controller.js';
import { verifyToken } from '../middlewares/auth.middleware.js';
import upload from '../helper/cloudinary.js';

const router = express.Router();

router.get('/getUser/:identifier', verifyToken, getUser);
router.delete('/deleteUser/:id', verifyToken, deleteUser);

// 👇 Thêm 2 route mới (phần này giữ nguyên như bạn cung cấp)
router.post('/uploadAvatar', verifyToken, upload.single('file'), uploadAvatar);
router.delete('/deleteAvatar', verifyToken, deleteAvatar);
router.put('/updateBio', verifyToken, updateBio);


// --- Routes for Follow / Unfollow / Get Lists ---
// Route này giờ sẽ xử lý cả việc theo dõi và hủy theo dõi
router.put('/follow/:id', verifyToken, toggleFollowUser);
router.get('/following/:id', verifyToken, getFollowing);
router.get('/followers/:id', verifyToken, getFollowers);

export default router;
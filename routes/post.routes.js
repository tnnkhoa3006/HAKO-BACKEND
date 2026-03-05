import express from 'express';
import {
  createPost,
  getPostUser,
  getPostById,
  deletePostById,
  addComment,
  getCommentsForItem,
  likePost
} from '../controllers/post.controller.js';
import { verifyToken } from '../middlewares/auth.middleware.js';
import upload from '../helper/cloudinary.js';

const router = express.Router();

router.post('/create', verifyToken, upload.single('file'), createPost);
router.get('/getPostUser/:userId', verifyToken, getPostUser);
router.delete('/delete/:postId', verifyToken, deletePostById);
router.get('/:postId', verifyToken, getPostById);
router.post('/like/:postId', verifyToken, likePost);

// --- Routes for Comments ---
router.post('/comments/:postId', verifyToken, addComment);

// Lấy comments của một post cụ thể
router.get('/comments/:itemType/:itemId', getCommentsForItem);

export default router;

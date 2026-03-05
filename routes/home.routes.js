import express from 'express';
import {
  getPostHome,
  suggestUsers,
  getStoryHome,
  getRecommendedPosts
} from '../controllers/home.controller.js';
import { verifyToken } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.get('/getPostHome', verifyToken, getPostHome);
router.get('/suggestUsers', verifyToken, suggestUsers);
router.get('/getStoryHome', verifyToken, getStoryHome);
router.get('/getRecommendedPosts', verifyToken, getRecommendedPosts);

export default router;
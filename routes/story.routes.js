import express from 'express';
import { getArchivedStories, getStoriesByUser, createStory, getMusicStory } from '../controllers/story.controller.js';
import { verifyToken } from '../middlewares/auth.middleware.js';
import upload from '../helper/cloudinary.js';

const router = express.Router();

router.get('/archived-stories', verifyToken, getArchivedStories);
router.get('/getStoryId/:userId', getStoriesByUser);
router.get('/music', getMusicStory);

// Cập nhật route createStory để hỗ trợ upload nhiều file
router.post('/createStory',
  verifyToken,
  upload.fields([
    { name: 'media', maxCount: 1 },    // File media chính (ảnh hoặc video)
    { name: 'audio', maxCount: 1 }     // File audio tùy chọn
  ]),
  createStory
);

export default router;
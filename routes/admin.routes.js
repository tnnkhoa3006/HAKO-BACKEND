import express from 'express';
import multer from 'multer';
import { verifyToken } from '../middlewares/auth.middleware.js';
import { requireAdmin } from '../middlewares/admin.middleware.js';
import upload from '../helper/cloudinary.js';
import * as admin from '../controllers/admin.controller.js';
import { createPost, deletePostById } from '../controllers/post.controller.js';
import { createStory } from '../controllers/story.controller.js';
import { deleteUser } from '../controllers/user.controller.js';

const router = express.Router();
const musicUpload = multer({ dest: 'temp/' });

router.use(verifyToken, requireAdmin);

router.get('/users', admin.listUsers);
router.post('/users', admin.createUser);
router.patch('/users/:id', admin.updateUser);
router.delete('/users/:id', deleteUser);

router.post('/notify', admin.notifyUsers);

router.get('/posts', admin.listPostsAdmin);
router.post('/posts', upload.single('file'), createPost);
router.delete('/posts/:postId', deletePostById);

router.get('/stories', admin.listStoriesAdmin);
router.post(
  '/stories',
  upload.fields([
    { name: 'media', maxCount: 1 },
    { name: 'audio', maxCount: 1 },
  ]),
  createStory
);
router.delete('/stories/:storyId', admin.deleteStoryAdmin);

router.post('/seed-sample-data', admin.seedSampleData);

router.post('/music/upload', musicUpload.single('media'), admin.uploadMusic);

export default router;

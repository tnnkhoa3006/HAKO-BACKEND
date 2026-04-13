import StoryMusic from '../models/storyMusic.model.js';
import { getCloudinaryMusic } from '../config/cloudinary.config.js';
import User from '../models/user.model.js';
import Post from '../models/post.model.js';
import Story from '../models/story.model.js';
import Notification from '../models/notification.model.js';
import cloudinary from 'cloudinary';
import { getIO } from '../middlewares/socket.middleware.js';

export const uploadMusic = async (req, res) => {
  try {
    const { singer, nameMusic, image, duration } = req.body;
    if (!singer || !nameMusic || !image) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin nhạc (singer, nameMusic, image)' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Thiếu file nhạc (media)' });
    }
    const musicFile = req.file;
    const cloudinaryMusic = getCloudinaryMusic();
    const uploadResult = await cloudinaryMusic.uploader.upload(musicFile.path, {
      resource_type: 'video',
      folder: 'story-music',
      use_filename: true,
      unique_filename: false
    });
    const newMusic = await StoryMusic.create({
      author: singer,
      nameMusic,
      image,
      media: uploadResult.secure_url,
      mediaPublicId: uploadResult.public_id,
      duration: duration || uploadResult.duration || null
    });
    res.status(201).json({ success: true, music: newMusic });
  } catch (error) {
    console.error('Loi uploadMusic:', error);
    res.status(500).json({ success: false, message: 'Loi server khi upload nhac' });
  }
};

export const listUsers = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
    const limit = Math.min(100, parseInt(String(req.query.limit), 10) || 30);
    const q = String(req.query.q || '').trim();
    const filter = q
      ? {
          $or: [
            { username: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
            { fullName: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
            ...(q.includes('@') ? [{ email: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }] : []),
          ],
        }
      : {};
    const [users, total] = await Promise.all([
      User.find(filter).select('-password').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      User.countDocuments(filter),
    ]);
    res.json({ success: true, users, total, page, limit });
  } catch (e) {
    console.error('listUsers', e);
    res.status(500).json({ success: false, message: 'Loi server' });
  }
};

export const createUser = async (req, res) => {
  try {
    const { username, fullName, email, phoneNumber, password, role } = req.body;
    if (!username || !fullName || !password || (!email && !phoneNumber)) {
      return res.status(400).json({ success: false, message: 'Thieu thong tin bat buoc' });
    }
    const exists = await User.findOne({
      $or: [
        { username },
        ...(email ? [{ email: String(email).toLowerCase() }] : []),
        ...(phoneNumber ? [{ phoneNumber: String(phoneNumber) }] : []),
      ],
    });
    if (exists) {
      return res.status(400).json({ success: false, message: 'Tai khoan da ton tai' });
    }
    const newUser = await User.create({
      username,
      fullName,
      email,
      phoneNumber,
      password,
      authType: 'local',
      role: role === 'admin' ? 'admin' : 'user',
    });
    const safe = await User.findById(newUser._id).select('-password').lean();
    res.status(201).json({ success: true, user: safe });
  } catch (e) {
    console.error('createUser', e);
    res.status(500).json({ success: false, message: 'Loi server' });
  }
};

export const updateUser = async (req, res) => {
  try {
    const allowed = ['fullName', 'bio', 'isPrivate', 'checkMark'];
    const updates = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: 'Khong co truong hop le' });
    }
    const user = await User.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true }).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'Khong tim thay' });
    }
    res.json({ success: true, user });
  } catch (e) {
    console.error('updateUser', e);
    res.status(500).json({ success: false, message: 'Loi server' });
  }
};

export const notifyUsers = async (req, res) => {
  try {
    const { message, userIds, broadcast } = req.body;
    if (!message || !String(message).trim()) {
      return res.status(400).json({ success: false, message: 'Thieu noi dung thong bao' });
    }
    const fromId = req.user._id || req.user.id;
    let targets = [];
    if (broadcast) {
      const all = await User.find().select('_id').lean();
      targets = all.map((u) => u._id.toString());
    } else if (Array.isArray(userIds) && userIds.length) {
      targets = userIds.map((id) => String(id));
    } else {
      return res.status(400).json({ success: false, message: 'Chon nguoi nhan hoac gui toan bo' });
    }
    const text = String(message).trim().slice(0, 2000);
    const docs = targets.map((uid) => ({
      user: uid,
      type: 'system',
      fromUser: fromId,
      message: text,
    }));
    const inserted = await Notification.insertMany(docs);
    const io = getIO();
    if (io) {
      for (const n of inserted) {
        const populated = await Notification.findById(n._id).populate('fromUser', 'username profilePicture');
        io.to(n.user.toString()).emit('notification:new', { notification: populated });
      }
    }
    res.json({ success: true, count: inserted.length });
  } catch (e) {
    console.error('notifyUsers', e);
    res.status(500).json({ success: false, message: 'Loi server' });
  }
};

export const listPostsAdmin = async (req, res) => {
  try {
    const limit = Math.min(100, parseInt(String(req.query.limit), 10) || 40);
    const posts = await Post.find()
      .populate('author', 'username fullName profilePicture')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    res.json({ success: true, posts });
  } catch (e) {
    console.error('listPostsAdmin', e);
    res.status(500).json({ success: false, message: 'Loi server' });
  }
};

export const listStoriesAdmin = async (req, res) => {
  try {
    const limit = Math.min(100, parseInt(String(req.query.limit), 10) || 40);
    const stories = await Story.find({ isArchived: false })
      .populate('author', 'username fullName profilePicture')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    res.json({ success: true, stories });
  } catch (e) {
    console.error('listStoriesAdmin', e);
    res.status(500).json({ success: false, message: 'Loi server' });
  }
};

export const deleteStoryAdmin = async (req, res) => {
  try {
    const story = await Story.findById(req.params.storyId);
    if (!story) {
      return res.status(404).json({ success: false, message: 'Khong tim thay story' });
    }
    try {
      if (story.mediaPublicId) {
        await cloudinary.v2.uploader.destroy(story.mediaPublicId);
      }
      if (story.audioPublicId) {
        await cloudinary.v2.uploader.destroy(story.audioPublicId, { resource_type: 'video' });
      }
    } catch (err) {
      console.error('cloudinary destroy story', err);
    }
    await story.deleteOne();
    res.json({ success: true, message: 'Da xoa story' });
  } catch (e) {
    console.error('deleteStoryAdmin', e);
    res.status(500).json({ success: false, message: 'Loi server' });
  }
};

export const seedSampleData = async (req, res) => {
  try {
    const exists = await User.findOne({ username: /^hako_seed_demo_/ });
    if (exists) {
      return res.status(400).json({ success: false, message: 'Du lieu mau da ton tai (hako_seed_demo_*)' });
    }
    const imgUrl = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=900';
    const created = [];
    for (let i = 0; i < 3; i++) {
      const u = await User.create({
        username: `hako_seed_demo_${i}`,
        fullName: `Nguoi dung mau ${i + 1}`,
        email: `hako_seed_demo_${i}@example.local`,
        password: 'Demo123456',
        authType: 'local',
        role: 'user',
      });
      const p = await Post.create({
        caption: `Bai viet mau #${i + 1}`,
        desc: '',
        fileUrl: imgUrl,
        filePublicId: `seed_demo_${u._id}`,
        type: 'image',
        author: u._id,
      });
      await User.findByIdAndUpdate(u._id, { $push: { posts: p._id } });
      created.push({ userId: u._id, postId: p._id });
    }
    res.status(201).json({ success: true, message: 'Tao du lieu mau thanh cong', created });
  } catch (e) {
    console.error('seedSampleData', e);
    res.status(500).json({ success: false, message: 'Loi server' });
  }
};

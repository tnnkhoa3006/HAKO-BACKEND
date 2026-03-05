import StoryMusic from '../models/storyMusic.model.js';
import { getCloudinaryMusic } from '../config/cloudinary.config.js';

// Upload music (upload file lên Cloudinary music)
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
    // Upload lên Cloudinary music
    const cloudinaryMusic = getCloudinaryMusic();
    const uploadResult = await cloudinaryMusic.uploader.upload(musicFile.path, {
      resource_type: 'video', // Cloudinary dùng 'video' cho file audio/mp3
      folder: 'story-music',
      use_filename: true,
      unique_filename: false
    });
    // Lưu vào DB
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
    console.error('Lỗi uploadMusic:', error);
    res.status(500).json({ success: false, message: 'Lỗi server khi upload nhạc' });
  }
};


import mongoose from 'mongoose';
import Story from '../models/story.model.js';
import User from '../models/user.model.js';
import ArchivedStorie from '../models/archivedStory.model.js';
import StoryMusic from '../models/storyMusic.model.js';
import { uploadImage, uploadVideo, uploadAudio } from '../utils/cloudinaryUpload.js';

// Lấy kho lưu trữ stories đã hết hạn
export const getArchivedStories = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ success: false, message: 'Bạn chưa đăng nhập hoặc token không hợp lệ' });
    }
    const myId = req.user.id;

    // Lấy tất cả stories đã archive của người dùng từ ArchivedStorie
    const archivedStories = await ArchivedStorie.find({
      author: myId
    })
      .populate('author', 'username profilePicture checkMark')
      .populate('viewers.user', 'username profilePicture')
      .sort({ createdAt: -1 })
      .lean();

    // Format stories mà không nhóm theo tháng
    const formattedStories = archivedStories.map(story => ({
      _id: story._id,
      media: story.media,
      mediaType: story.mediaType,
      mediaPublicId: story.mediaPublicId,
      caption: story.caption,
      createdAt: story.createdAt,
      expiresAt: story.expiresAt,
      isArchived: story.isArchived,
      viewCount: story.viewers?.length || 0,
      viewers: story.viewers || [],
      author: {
        _id: story.author._id,
        username: story.author.username,
        profilePicture: story.author.profilePicture,
        checkMark: story.author.checkMark
      },
      audio: story.audio || null,
      audioPublicId: story.audioPublicId || null,
      audioDuration: story.audioDuration || null,
      hasAudio: story.mediaType.includes('/audio'),
      isVideoWithAudio: story.mediaType === 'video/audio',
      isImageWithAudio: story.mediaType === 'image/audio',
      muteOriginalAudio: story.muteOriginalAudio || false,
      status: 'archived'
    }));

    res.status(200).json({
      success: true,
      archivedStories: formattedStories
    });

  } catch (error) {
    console.error('Lỗi khi lấy kho lưu trữ stories:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy kho lưu trữ stories'
    });
  }
};

// Tạo story mới - đã cập nhật để hỗ trợ audio
export const createStory = async (req, res) => {
  try {
    const { caption, musicId } = req.body;
    let authorId = req.user.id;
    if (req.user.role === 'admin' && req.body.authorId) {
      if (!mongoose.Types.ObjectId.isValid(req.body.authorId)) {
        return res.status(400).json({ success: false, message: 'authorId khong hop le' });
      }
      const targetAuthor = await User.findById(req.body.authorId);
      if (!targetAuthor) {
        return res.status(404).json({ success: false, message: 'Khong tim thay tac gia story' });
      }
      authorId = req.body.authorId;
    }

    // Kiểm tra có file media không
    if (!req.files || !req.files.media) {
      return res.status(400).json({
        success: false,
        message: 'Cần tải lên media cho story'
      });
    }

    const mediaFile = req.files.media[0];
    const audioFile = req.files.audio ? req.files.audio[0] : null;

    // Xác định loại media gốc
    const baseMediaType = mediaFile.mimetype.startsWith('image/') ? 'image' : 'video';

    // Lấy thông tin user để kiểm tra username
    const authorUser = await User.findById(authorId).lean();
    let isVanloc = false;
    if (authorUser && authorUser.username === 'khoatnn_6') {
      isVanloc = true;
    }

    // Upload media file
    let mediaResult;
    let videoDuration = null;
    if (baseMediaType === 'image') {
      mediaResult = await uploadImage(mediaFile.path, 'stories');
    } else {
      mediaResult = await uploadVideo(mediaFile.path, 'stories');
      // Nếu là video thường (không có audio), lấy duration và kiểm tra max 1 phút
      if (baseMediaType === 'video' && !audioFile && !musicId) {
        if (mediaResult.duration) {
          videoDuration = mediaResult.duration;
          if (videoDuration > 60) {
            return res.status(400).json({
              success: false,
              message: 'Video gốc không được vượt quá 1 phút.'
            });
          }
        }
      }
    }

    // Xử lý audio: Ưu tiên file upload, sau đó đến musicId
    let audioResult = null;
    if (audioFile) {
      audioResult = await uploadAudio(audioFile.path, 'stories/audio');
    } else if (musicId) {
      const music = await StoryMusic.findById(musicId);
      if (music) {
        audioResult = {
          secure_url: music.media,
          public_id: music.mediaPublicId,
          duration: music.duration
        };
      }
    }

    // Xác định mediaType cuối cùng
    let mediaType = baseMediaType;
    if (audioResult) {
      mediaType = `${baseMediaType}/audio`;
    }

    // Tạo story mới
    const storyData = {
      author: authorId,
      media: mediaResult.secure_url,
      mediaType,
      mediaPublicId: mediaResult.public_id,
      caption,
      // expiresAt 24 tiếng
      expiresAt: isVanloc ? new Date('2099-01-01T00:00:00.000Z') : new Date(Date.now() + 24 * 60 * 60 * 1000)
    };
    // Nếu là video thường, thêm videoDuration
    if (videoDuration) {
      storyData.videoDuration = videoDuration;
    }

    // Thêm thông tin audio nếu có (chỉ cho image/audio hoặc video/audio)
    if (audioResult) {
      storyData.audio = audioResult.secure_url;
      storyData.audioPublicId = audioResult.public_id;
      storyData.audioDuration = audioResult.duration || null;
      if (baseMediaType === 'video') {
        storyData.muteOriginalAudio = true;
      }
    }

    const newStory = await Story.create(storyData);
    await newStory.populate('author', 'username profilePicture checkMark');

    res.status(201).json({
      success: true,
      message: 'Đã tạo story thành công',
      story: {
        ...newStory.toObject(),
        hasAudio: !!audioResult,
        isVideoWithAudio: mediaType === 'video/audio',
        isImageWithAudio: mediaType === 'image/audio',
        videoDuration: (!audioResult && (videoDuration || newStory.videoDuration)) || null
      }
    });
  } catch (error) {
    console.error('Lỗi khi tạo story:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi tạo story'
    });
  }
};

// Lấy danh sách story của một người dùng (chỉ trả về _id và author)
// GỢI Ý: Để cập nhật view, FE nên gọi socket.emit('story:view', { storyId, userId }) khi user xem story
export const getStoriesByUser = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'Thiếu userId hoặc username' });
    }

    // Cho phép tìm bằng _id hoặc username
    let user;
    if (/^[0-9a-fA-F]{24}$/.test(userId)) {
      user = await User.findById(userId).lean();
      if (!user) {
        user = await User.findOne({ username: userId }).lean();
      }
    } else {
      user = await User.findOne({ username: userId }).lean();
    }

    if (!user) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy user' });
    }

    // Nếu là user khoatnn_6 thì luôn trả về story, bất kể expiresAt
    let storyQuery = {
      author: user._id,
      isArchived: false
    };
    if (user.username !== 'khoatnn_6') {
      storyQuery.expiresAt = { $gt: new Date() };
    }

    const stories = await Story.find(storyQuery)
      .populate('author', 'username profilePicture checkMark')
      .sort({ createdAt: -1 })
      .lean();
    const hasStory = stories.length > 0;
    res.status(200).json({
      success: true,
      hasStory, // trả về true/false
      stories: stories.map(story => ({
        ...story,
        hasAudio: !!story.audio,
        isVideoWithAudio: story.mediaType === 'video/audio',
        isImageWithAudio: story.mediaType === 'image/audio'
      }))
    });
  } catch (error) {
    console.error('Lỗi khi lấy stories theo user:', error);
    res.status(500).json({ success: false, message: 'Lỗi server khi lấy stories theo user' });
  }
};

// Lấy danh sách story có nhạc (dành cho admin)
export const getMusicStory = async (req, res) => {
  try {
    const musicList = await StoryMusic.find().sort({ createdAt: -1 }).lean();
    res.status(200).json({
      success: true,
      music: musicList.map(m => ({
        ...m,
        start: m.start || 0,
        end: m.end || (m.duration || null)
      }))
    });
  } catch (error) {
    console.error('Lỗi getMusicStory:', error);
    res.status(500).json({ success: false, message: 'Lỗi server khi lấy danh sách nhạc' });
  }
};




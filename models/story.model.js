import mongoose from 'mongoose';

const StorySchema = new mongoose.Schema({
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  media: {
    type: String,
    required: true
  },
  mediaType: {
    type: String,
    enum: ['image', 'video', 'image/audio', 'video/audio'],
    required: true
  },
  mediaPublicId: String,
  // Thêm trường audio
  audio: {
    type: String, // URL của file audio trên Cloudinary
    default: null
  },
  audioPublicId: {
    type: String, // Public ID của file audio trên Cloudinary
    default: null
  },
  audioDuration: {
    type: Number, // Thời lượng audio tính bằng giây
    default: null
  },
  // Cờ để biết có tắt âm thanh gốc của video không
  muteOriginalAudio: {
    type: Boolean,
    default: false
  },
  caption: String,
  viewers: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    viewedAt: {
      type: Date,
      default: Date.now
    }
  }],
  isArchived: {
    type: Boolean,
    default: false
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours from now
  }
}, {
  timestamps: true
});

// XÓA HOẶC COMMENT DÒNG NÀY ĐỂ KHÔNG TỰ ĐỘNG XÓA STORY HẾT HẠN
// StorySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('Story', StorySchema);
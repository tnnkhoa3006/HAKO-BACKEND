import mongoose from 'mongoose';

const ArchivedStorySchema = new mongoose.Schema({
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
  audio: {
    type: String,
    default: null
  },
  audioPublicId: {
    type: String,
    default: null
  },
  audioDuration: {
    type: Number,
    default: null
  },
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
    default: true
  },
  expiresAt: {
    type: Date
  }
}, {
  timestamps: true
});

export default mongoose.model('ArchivedStorie', ArchivedStorySchema);

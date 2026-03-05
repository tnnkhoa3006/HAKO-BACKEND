import mongoose from 'mongoose';

const storyMusicSchema = new mongoose.Schema({
  author: {
    type: String, // Tên ca sĩ
    required: true
  },
  nameMusic: {
    type: String, // Tên nhạc
    required: true
  },
  image: {
    type: String, // URL hình ảnh
    required: true
  },
  media: {
    type: String, // URL nhạc
    required: true
  },
  mediaPublicId: {
    type: String, // Cloudinary public id
    required: true
  },
  duration: {
    type: Number, // Thời lượng nhạc (giây)
    default: null
  },
  start: {
    type: Number, // Thời lượng bắt đầu (giây)
    default: 0
  },
  end: {
    type: Number, // Thời lượng kết thúc (giây)
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.model('StoryMusic', storyMusicSchema);

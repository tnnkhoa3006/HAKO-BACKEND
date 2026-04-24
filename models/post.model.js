import mongoose from "mongoose";

const postSchema = new mongoose.Schema({
  caption: {
    type: String,
    max: 500,
    default: "",
  },
  desc: {
    type: String,
    max: 500,
  },
  fileUrl: {
    type: String, // URL từ Cloudinary
    default: "",
  },
  filePublicId: {
    type: String, // ID để xoá file khỏi Cloudinary
    default: "",
  },
  type: {
    type: String,
    enum: ["image", "video", "text"],
    required: true,
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  likes: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    }
  ],
  comments: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment'
  }],
  // Thông tin được gắn thêm bởi AI
  aiTopics: [{
    type: String,
    trim: true,
  }],
  aiSummary: {
    type: String,
    max: 1000,
  },
  buffedLikes: {
    type: Number,
    default: null
  },
  buffedCommentCount: {
    type: Number,
    default: null
  },
  buffedReplyCount: {
    type: Number,
    default: null
  }
}, { timestamps: true });

const Post = mongoose.model('Post', postSchema);
export default Post;

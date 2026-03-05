import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
  receiverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  message: {
    type: String,
    required: false, // Cho phép gửi media không cần message text
    default: '',
  },
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    default: null,
    // index: true,
  },
  isRead: {
    type: Boolean,
    default: false,
  },
  mediaUrl: {
    type: String,
    default: null,
  },
  mediaType: {
    type: String, // 'image' | 'video'
    enum: [null, 'image', 'video'],
    default: null,
  },
}, { timestamps: true });

messageSchema.index({ senderId: 1, receiverId: 1 });
messageSchema.index({ replyTo: 1 }); // Index cho reply

const Message = mongoose.model('Message', messageSchema);
export default Message;
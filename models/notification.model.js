import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Người nhận thông báo
  type: { type: String, enum: ['like', 'follow', 'comment', 'reply'], required: true }, // Thêm 'reply' vào enum
  fromUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Người thực hiện hành động
  post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' }, // Nếu là like/comment thì có post
  comment: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment' }, // Nếu là comment thì có comment
  isRead: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const Notification = mongoose.model('Notification', notificationSchema);
export default Notification;

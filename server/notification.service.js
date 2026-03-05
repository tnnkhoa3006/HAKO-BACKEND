import Notification from '../models/notification.model.js';
import { getIO } from '../middlewares/socket.middleware.js';

// Tạo thông báo (like, comment, reply)
export async function createNotification({ user, type, fromUser, post = null, comment = null, parentComment = null }) {
  if (user.toString() === fromUser.toString()) return; // Không gửi thông báo cho chính mình
  // Like: chỉ tạo nếu chưa có
  if (type === 'like') {
    const existed = await Notification.findOne({ user, type, fromUser, post });
    if (existed) return;
  }
  // Comment: chỉ tạo nếu chưa có comment notification cùng post, comment, fromUser
  if (type === 'comment') {
    // Nếu là reply thì type = 'reply', nếu là comment gốc thì type = 'comment'
    const notificationType = parentComment ? 'reply' : 'comment';
    const existed = await Notification.findOne({ user, type: notificationType, fromUser, post, comment });
    if (existed) return;
    const notification = await Notification.create({ user, type: notificationType, fromUser, post, comment });
    // Emit notification:new cho user nhận
    const io = getIO && getIO();
    if (io) io.to(user.toString()).emit('notification:new', { notification });
    return;
  }
  // Reply: type = 'reply' (nếu muốn tách riêng)
  if (type === 'reply') {
    const existed = await Notification.findOne({ user, type: 'reply', fromUser, post, comment });
    if (existed) return;
    const notification = await Notification.create({ user, type: 'reply', fromUser, post, comment });
    const io = getIO && getIO();
    if (io) io.to(user.toString()).emit('notification:new', { notification });
    return;
  }
  // Các loại khác (follow...)
  const notification = await Notification.create({ user, type, fromUser, post, comment });
  const io = getIO && getIO();
  if (io) io.to(user.toString()).emit('notification:new', { notification });
}

// Xóa notification like khi unlike
export async function removeLikeNotification({ user, fromUser, post }) {
  await Notification.deleteOne({ user, type: 'like', fromUser, post });
}

// Đổi export sang CommonJS cho notification service
export default {
  createNotification,
  removeLikeNotification
};
import Notification from '../models/notification.model.js';

// Lấy danh sách thông báo cho user
export const getNotifications = async (req, res) => {
  try {
    const userId = req.user._id;
    const notifications = await Notification.find({ user: userId })
      .sort({ createdAt: -1 })
      .populate('fromUser', 'username profilePicture')
      .populate('post', '_id')
      .populate('comment', '_id')
      .limit(50);
    res.json({ success: true, notifications });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Lỗi lấy thông báo', error });
  }
};

// Đánh dấu đã đọc
export const markAsRead = async (req, res) => {
  try {
    const userId = req.user._id;
    await Notification.updateMany({ user: userId, isRead: false }, { isRead: true });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Lỗi cập nhật', error });
  }
};

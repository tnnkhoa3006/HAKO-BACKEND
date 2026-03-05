import Story from '../models/story.model.js';
import ArchivedStorie from '../models/archivedStory.model.js';
import User from '../models/user.model.js';

// Archive story after expiration (scheduled job) - đã cập nhật để xử lý audio
export const archiveExpiredStories = async () => {
  try {
    // Find expired but not archived stories
    const expiredStories = await Story.find({
      expiresAt: { $lte: new Date() },
      isArchived: false
    }).populate('author', 'username');

    for (const story of expiredStories) {
      // Nếu là user khoatnn_6 thì vẫn lưu vào archive nhưng KHÔNG xóa khỏi Story
      if (story.author && story.author.username === 'khoatnn_6') {
        try {
          // Kiểm tra nếu đã có trong archive thì bỏ qua
          const existed = await ArchivedStorie.findOne({ mediaPublicId: story.mediaPublicId });
          if (!existed) {
            const archived = new ArchivedStorie({
              ...story.toObject(),
              isArchived: true
            });
            await archived.save();
          }
        } catch (err) {
          console.error('Lỗi khi lưu vào ArchivedStorie cho khoatnn_6:', err, '\nStoryId:', story._id);
        }
        continue; // KHÔNG xóa khỏi Story
      }
      try {
        // Tạo bản ghi mới trong ArchivedStorie
        const archived = new ArchivedStorie({
          ...story.toObject(),
          isArchived: true
        });
        await archived.save();
        // Chỉ xóa story nếu lưu thành công
        await Story.deleteOne({ _id: story._id });
      } catch (err) {
        console.error('Lỗi khi lưu vào ArchivedStorie hoặc xóa Story:', err, '\nStoryId:', story._id);
        // KHÔNG xóa story nếu lỗi lưu kho lưu trữ
      }
    }
  } catch (error) {
    console.error('Lỗi khi archive stories:', error);
  }
};
import Story from '../models/story.model.js';

// Cập nhật view cho story, chỉ cho phép mỗi user 1 lần
// Thêm tham số onlineUsers
export const viewStory = async (storyId, userId) => {
  if (!storyId || !userId) return null;
  const story = await Story.findById(storyId);
  if (!story) return null;

  // 1. Làm sạch viewers: chỉ giữ viewer mới nhất cho mỗi userId
  const cleanMap = new Map();
  for (const v of story.viewers) {
    const id = v.user?.toString?.() || v._id?.toString?.();
    if (!id) continue;
    if (!cleanMap.has(id) || cleanMap.get(id).viewedAt < v.viewedAt) {
      cleanMap.set(id, v);
    }
  }
  story.viewers = Array.from(cleanMap.values());

  // 2. Xóa viewer của userId hiện tại (nếu có)
  story.viewers = story.viewers.filter(v => (v.user?.toString?.() || v._id?.toString?.()) !== userId.toString());

  // 3. Push viewer mới
  story.viewers.push({ _id: userId, user: userId, viewedAt: new Date() });
  await story.save();

  // 4. Populate viewers.user để lấy thông tin user
  const updated = await Story.findById(storyId).populate('viewers.user', 'username fullName profilePicture');

  // 5. Làm sạch viewers khi trả về: chỉ giữ viewer mới nhất cho mỗi userId
  const viewerMap2 = new Map();
  for (const v of updated.viewers) {
    const id = v.user?._id?.toString?.() || v.user?.toString?.();
    if (!id) continue;
    if (!viewerMap2.has(id) || viewerMap2.get(id).viewedAt < v.viewedAt) {
      viewerMap2.set(id, {
        _id: v.user._id,
        user: v.user._id,
        username: v.user.username,
        fullName: v.user.fullName,
        profilePicture: v.user.profilePicture,
        viewedAt: v.viewedAt
        // Không trả về isOnline, lastActive, lastOnline ở đây nữa
      });
    }
  }
  // Loại bỏ tác giả khỏi viewers
  const authorId = (updated.author?._id || updated.user?._id || updated.author || updated.user || "").toString();
  const filteredViewers = Array.from(viewerMap2.values()).filter(v => v._id.toString() !== authorId);
  return filteredViewers;
};

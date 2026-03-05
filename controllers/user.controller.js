import User from '../models/user.model.js';
import cloudinary from '../config/cloudinary.config.js';
import { uploadImage } from '../utils/cloudinaryUpload.js';
import mongoose from 'mongoose';
import { generateRandomUser, FAKE_USERS } from '../helper/buffAdmin.js';
import { createNotification } from '../server/notification.service.js';
import Interaction from '../models/interaction.model.js';

// Your existing deleteUser function
export const deleteUser = async (req, res) => {
  try {
    const userId = req.params.id;

    // Kiểm tra xem người dùng có tồn tại hay không
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy người dùng'
      });
    }

    // Kiểm tra quyền xóa (chỉ admin hoặc chính người dùng đó mới có quyền xóa)
    if (req.user.id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền xóa người dùng này'
      });
    }

    // Xóa người dùng
    await User.findByIdAndDelete(userId);

    // Nếu người dùng đang xóa tài khoản của chính mình, hãy xóa cookie token
    if (req.user.id === userId) {
      res.clearCookie('token', {
        httpOnly: true,
        secure: true,
        sameSite: 'None',
        path: '/'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Đã xóa người dùng thành công'
    });
  } catch (error) {
    console.error('Lỗi khi xóa người dùng:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi máy chủ'
    });
  }
};

// Function to get user by ID or username
export const getUser = async (req, res) => {
  try {
    const { identifier } = req.params; // identifier can be either ID or username

    let user = null;

    // Check if identifier is a valid MongoDB ObjectId
    const isValidObjectId = mongoose.Types.ObjectId.isValid(identifier);

    if (isValidObjectId) {
      user = await User.findById(identifier)
        .select('-password')
        .populate('archivedStories', 'media mediaType caption createdAt viewCount')
        .lean();
    }

    if (!user) {
      user = await User.findOne({ username: identifier })
        .select('-password')
        .populate('archivedStories', 'media mediaType caption createdAt viewCount')
        .lean();
    }

    // Nếu không tìm thấy user thật, thử tìm user ảo
    if (!user) {
      // Tìm user ảo theo username (không phân biệt hoa thường) trong FAKE_USERS cố định
      user = FAKE_USERS.find(u =>
        (u._id === identifier) ||
        (u.username && u.username.toLowerCase() === identifier.toLowerCase())
      );
      if (user) {
        // Đảm bảo user ảo có đầy đủ thông tin như user thật
        user = {
          ...user,
          id: user._id, // FE NextJS cần
          username: user.username,
          fullName: user.fullName,
          profilePicture: user.profilePicture || 'https://thumbs.dreamstime.com/b/default-avatar-profile-icon-vector-social-media-user-portrait-176256935.jpg',
          bio: user.bio || 'Đây là tài khoản ảo dùng cho mục đích demo.',
          followers: user.followers || [],
          following: user.following || [],
          posts: user.posts || [],
          archivedStories: user.archivedStories || [],
          isOnline: false,
          isPrivate: false,
          checkMark: user.isVerified || user.checkMark || false,
          isFake: true,
          authType: 'local',
          lastActive: user.lastActive || new Date(),
          lastOnline: user.lastOnline || null,
          createdAt: user.createdAt || new Date(Date.now() - Math.random() * 86400000 * 30),
          updatedAt: user.updatedAt || new Date(),
          followersCount: (user.followers ? user.followers.length : 0),
          followingCount: (user.following ? user.following.length : 0),
          archivedStoriesCount: (user.archivedStories ? user.archivedStories.length : 0),
          hasStories: false
        };
        return res.status(200).json({
          success: true,
          user
        });
      }
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy người dùng'
      });
    }

    // ✅ Buff đặc biệt cho khoatnn_6
    if (user.username === 'khoatnn_6') {
      // Cấp tích xanh
      if (!user.checkMark) {
        await User.updateOne({ _id: user._id }, { $set: { checkMark: true } });
        user.checkMark = true;
      }

      // Buff followers lên 1M (1,000,000)
      const buffedFollowersCount = 1000000;
      user.followersCount = user.followers.length + buffedFollowersCount;
      user.isBuffed = true;
      user.realFollowers = user.followers.length;
      user.buffedFollowers = buffedFollowersCount;
    } else {
      // Người dùng bình thường
      user.followersCount = user.followers.length;
      user.isBuffed = false;
    }

    // Thêm các thông tin bổ sung
    user.followingCount = user.following.length;

    // Xử lý archivedStories
    user.archivedStories = user.archivedStories || [];
    user.archivedStoriesCount = user.archivedStories.length;

    // Sắp xếp archived stories theo thời gian mới nhất
    user.archivedStories.sort((a, b) => b.createdAt - a.createdAt);

    // Kiểm tra user này có story còn hạn không
    const now = new Date();
    const hasStories = await (async () => {
      const count = await (await import('../models/story.model.js')).default.countDocuments({
        author: user._id,
        isArchived: false,
        expiresAt: { $gt: now }
      });
      return count > 0;
    })();
    user.hasStories = hasStories;

    res.status(200).json({
      success: true,
      user
    });
  } catch (error) {
    console.error('Lỗi khi lấy thông tin người dùng:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi máy chủ'
    });
  }
};

// Upload avatar
export const uploadAvatar = async (req, res) => {
  try {
    const userId = req.user.id;

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Không có file nào được tải lên' });
    }

    const userToUpdate = await User.findById(userId);
    if (!userToUpdate) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
    }

    if (userToUpdate.profilePicturePublicId) {
      try {
        await cloudinary.uploader.destroy(userToUpdate.profilePicturePublicId);
      } catch (cloudinaryError) {
        console.error('Lỗi khi xóa ảnh cũ trên Cloudinary:', cloudinaryError);
      }
    }

    // Upload file lên Cloudinary
    const result = await uploadImage(req.file.path, 'avatars');

    // Cập nhật thông tin người dùng
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        profilePicture: result.secure_url,
        profilePicturePublicId: result.public_id,
      },
      { new: true }
    ).select('-password').lean();

    res.status(200).json({
      success: true,
      message: 'Tải ảnh đại diện thành công',
      user: updatedUser,
    });
  } catch (error) {
    console.error('Lỗi khi upload avatar:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi tải ảnh đại diện' });
  }
};

// Xóa avatar
export const deleteAvatar = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
    }

    // Nếu có ảnh đại diện và public ID thì xóa khỏi Cloudinary
    if (user.profilePicturePublicId) {
      await cloudinary.uploader.destroy(user.profilePicturePublicId);
    }

    // Cập nhật user: khôi phục ảnh mặc định và xóa public ID trong DB
    user.profilePicture = User.schema.path('profilePicture').defaultValue;
    user.profilePicturePublicId = null;
    await user.save();

    const userResponse = user.toObject();
    delete userResponse.password;

    res.status(200).json({
      success: true,
      message: 'Đã xóa ảnh đại diện',
      profilePicture: userResponse.profilePicture
    });
  } catch (error) {
    console.error('Lỗi khi xóa avatar:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi xóa ảnh đại diện' });
  }
};

export const updateBio = async (req, res) => {
  try {
    const userId = req.user.id;
    const { bio } = req.body; // bio có thể rỗng hoặc có nội dung

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { bio: bio || '' }, // Nếu không có nội dung thì set rỗng
      { new: true, runValidators: true }
    ).select('-password').lean();

    if (!updatedUser) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
    }

    res.status(200).json({
      success: true,
      message: 'Cập nhật bio thành công',
      user: updatedUser,
    });
  } catch (error) {
    console.error('Lỗi khi cập nhật bio:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: 'Dữ liệu không hợp lệ', errors: error.errors });
    }
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi cập nhật bio' });
  }
};

// --- Chức năng Follow / Unfollow ---

export const toggleFollowUser = async (req, res) => {
  try {
    const currentUserId = req.user.id; // ID người dùng đang đăng nhập
    const param = req.params.id; // có thể là id hoặc username

    // 1. Xử lý tham số param có thể là ObjectId hoặc username
    let targetUser;

    if (mongoose.Types.ObjectId.isValid(param)) {
      // Nếu là ObjectId hợp lệ, tìm theo _id
      targetUser = await User.findById(param).select('username followers');
    }
    if (!targetUser) {
      // Nếu không tìm thấy theo id, hoặc param không phải ObjectId hợp lệ, thử tìm theo username
      targetUser = await User.findOne({ username: param }).select('username followers');
    }

    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng mục tiêu.' });
    }

    // 2. Không cho thao tác với chính mình
    if (currentUserId === targetUser._id.toString()) {
      return res.status(400).json({ success: false, message: 'Bạn không thể tự tương tác với chính mình theo cách này.' });
    }

    // 3. Tìm người dùng hiện tại
    const currentUser = await User.findById(currentUserId).select('following');

    if (!currentUser) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng hiện tại.' });
    }

    // 4. Kiểm tra trạng thái follow
    const isCurrentlyFollowing = currentUser.following.includes(targetUser._id);

    let message;
    let actionStatus;

    if (isCurrentlyFollowing) {
      // Hủy theo dõi
      await User.findByIdAndUpdate(currentUserId, {
        $pull: { following: targetUser._id }
      });
      await User.findByIdAndUpdate(targetUser._id, {
        $pull: { followers: currentUserId }
      });
      message = `Đã hủy theo dõi ${targetUser.username} thành công.`;
      actionStatus = 'unfollowed';
    } else {
      // Theo dõi
      await User.findByIdAndUpdate(currentUserId, {
        $addToSet: { following: targetUser._id }
      });
      await User.findByIdAndUpdate(targetUser._id, {
        $addToSet: { followers: currentUserId }
      });
      message = `Đã theo dõi ${targetUser.username} thành công.`;
      actionStatus = 'followed';
      // Tạo notification khi follow (không phải follow chính mình)
      await createNotification({
        user: targetUser._id,
        type: 'follow',
        fromUser: currentUserId
      });
      // Ghi nhận tương tác follow giữa currentUser và targetUser
      try {
        await Interaction.findOneAndUpdate(
          {
            user: currentUserId,
            targetUser: targetUser._id,
            type: 'follow'
          },
          {
            $inc: { weight: 5 },
            $set: { lastInteractionAt: new Date() }
          },
          { upsert: true, new: true }
        );
      } catch (interactionError) {
        console.error('Lỗi khi ghi log tương tác follow:', interactionError);
      }
    }

    return res.status(200).json({
      success: true,
      message,
      action: actionStatus,
      followUser: actionStatus === 'followed',
    });
  } catch (error) {
    console.error('Lỗi khi xử lý theo dõi/hủy theo dõi:', error);
    if (error.name === 'CastError' && error.kind === 'ObjectId') {
      return res.status(400).json({ success: false, message: 'ID người dùng không hợp lệ.' });
    }
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi xử lý yêu cầu.' });
  }
};

export const getFollowing = async (req, res) => {
  try {
    const userId = req.params.id;

    const user = await User.findById(userId)
      .populate({
        path: 'following',
        select: 'username fullName profilePicture checkMark isPrivate'
      })
      .select('username fullName')
      .lean();

    if (!user) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
    }

    // Cập nhật checkMark cho khoatnn_6 trong danh sách following
    const following = user.following.map(followingUser => {
      if (followingUser.username === 'khoatnn_6') {
        return { ...followingUser, checkMark: true };
      }
      return followingUser;
    });

    res.status(200).json({
      success: true,
      message: `Lấy danh sách đang theo dõi của ${user.username} thành công`,
      username: user.username,
      fullName: user.fullName,
      following: following
    });

  } catch (error) {
    console.error('Lỗi khi lấy danh sách đang theo dõi:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy danh sách đang theo dõi' });
  }
};

export const getFollowers = async (req, res) => {
  try {
    const userId = req.params.id;

    const user = await User.findById(userId)
      .populate({
        path: 'followers',
        select: 'username fullName profilePicture checkMark isPrivate'
      })
      .select('username fullName')
      .lean();

    if (!user) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
    }

    let allFollowers = [...user.followers];
    let totalFollowersCount = user.followers.length;

    // ✅ Buff đặc biệt cho khoatnn_6
    if (user.username === 'khoatnn_6') {
      const buffedFollowersCount = 1000000;
      totalFollowersCount = user.followers.length + buffedFollowersCount;

      // Tạo một số followers ảo để hiển thị (chỉ hiển thị 100 followers ảo đầu tiên để không quá tải)
      const sampleVirtualFollowers = [];
      const displayCount = Math.min(100, buffedFollowersCount);

      // Tạo các tên username đa dạng và thực tế hơn
      const prefixes = ['user', 'pro', 'official', 'real', 'fan', 'love', 'super', 'best', 'top', 'cool'];
      const suffixes = ['_official', '_pro', '_fan', '_love', '_2024', '_2025', '_vip', '_real', '_best', ''];

      for (let i = 1; i <= displayCount; i++) {
        const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
        const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
        const randomNum = Math.floor(Math.random() * 9999) + 1;

        sampleVirtualFollowers.push({
          _id: `virtual_${i}`,
          username: `${prefix}${randomNum}${suffix}`,
          fullName: `Fan ${i} của khoatnn_6`,
          profilePicture: 'https://thumbs.dreamstime.com/b/default-avatar-profile-icon-vector-social-media-user-portrait-176256935.jpg',
          checkMark: Math.random() > 0.98, // 2% chance có tích xanh
          isPrivate: Math.random() > 0.8, // 20% chance là private
          isVirtual: true // Đánh dấu là followers ảo
        });
      }

      // Trộn followers ảo vào đầu danh sách
      allFollowers = [...sampleVirtualFollowers, ...user.followers];
    }

    res.status(200).json({
      success: true,
      message: `Lấy danh sách người theo dõi của ${user.username} thành công`,
      username: user.username,
      fullName: user.fullName,
      totalFollowersCount: totalFollowersCount,
      realFollowersCount: user.followers.length,
      displayedFollowersCount: allFollowers.length,
      isBuffed: user.username === 'khoatnn_6',
      followers: allFollowers
    });

  } catch (error) {
    console.error('Lỗi khi lấy danh sách người theo dõi:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy danh sách người theo dõi' });
  }
};
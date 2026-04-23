// controllers/post.controllers.js
import mongoose from 'mongoose';
import Post from '../models/post.model.js';
import { uploadImage, uploadVideo } from '../utils/cloudinaryUpload.js';
import User from '../models/user.model.js';
import Comment from '../models/comment.model.js';
import Interaction from '../models/interaction.model.js';
import { analyzePostContent } from '../utils/aiContentTagger.js';
import {
  createCommentForPost,
  createCommentForReel,
  createReplyForComment,
} from '../server/comment.service.js';
import {
  generateRandomUser,
  generateRandomComment,
  generateNestedComments,
  generateBuffedMetrics
} from '../helper/buffAdmin.js';
import cloudinary from 'cloudinary';
import { createNotification, removeLikeNotification } from '../server/notification.service.js';


// Đăng bài viết (ảnh hoặc video)
export const createPost = async (req, res) => {
  try {
    const { caption, desc, type } = req.body;
    let authorId = req.user.id;
    if (req.user.role === 'admin' && req.body.authorId) {
      if (!mongoose.Types.ObjectId.isValid(req.body.authorId)) {
        return res.status(400).json({ success: false, message: 'authorId khong hop le' });
      }
      const targetAuthor = await User.findById(req.body.authorId);
      if (!targetAuthor) {
        return res.status(404).json({ success: false, message: 'Khong tim thay tac gia bai viet' });
      }
      authorId = req.body.authorId;
    }

    // VALIDATION: Kiểm tra user có tồn tại không
    const currentUser = await User.findById(authorId);
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy người dùng'
      });
    }

    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: 'Không có file nào được tải lên' });
    }

    if (!['image', 'video'].includes(type)) {
      return res
        .status(400)
        .json({
          success: false,
          message: 'Loại file không hợp lệ (image hoặc video)',
        });
    }

    let result;
    if (type === 'image') {
      result = await uploadImage(req.file.path, 'posts');
    } else if (type === 'video') {
      result = await uploadVideo(req.file.path, 'reels');
    }

    const newPost = new Post({
      caption,
      desc,
      fileUrl: result.secure_url,
      filePublicId: result.public_id,
      type,
      author: authorId,
    });

    await newPost.save();

    // Phân tích nội dung bài viết bằng AI để gắn chủ đề/tóm tắt (không chặn luồng nếu lỗi)
    try {
      const { topics, summary } = await analyzePostContent({ caption, desc });
      if ((topics && topics.length > 0) || summary) {
        newPost.aiTopics = topics || [];
        newPost.aiSummary = summary || undefined;
        await newPost.save();
      }
    } catch (aiError) {
      console.error('Lỗi khi gắn nhãn AI cho bài viết mới:', aiError);
    }

    // Chỉ thêm vào mảng posts của chính user đó nếu là ảnh
    if (type === 'image') {
      await User.findByIdAndUpdate(authorId, { $push: { posts: newPost._id } });
    }

    res.status(201).json({
      success: true,
      message: 'Đăng bài viết thành công',
      post: newPost,
    });
  } catch (error) {
    console.error('Lỗi khi tạo bài viết:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
  }
};

// Xóa bài viết theo ID
export const deletePostById = async (req, res) => {
  try {
    const { postId } = req.params;
    const currentUserId = req.user.id;

    // VALIDATION: Kiểm tra user hiện tại có tồn tại không
    const currentUser = await User.findById(currentUserId);
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy người dùng hiện tại'
      });
    }

    // Tìm bài viết và populate author để kiểm tra
    const post = await Post.findById(postId).populate('author', '_id username');
    if (!post) {
      return res
        .status(404)
        .json({ success: false, message: 'Không tìm thấy bài viết' });
    }

    const isAdmin = req.user.role === 'admin';
    const authorMongoId = post.author._id.toString();

    if (!isAdmin && authorMongoId !== currentUserId) {
      return res
        .status(403)
        .json({
          success: false,
          message: 'Ban chi co the xoa bai viet cua chinh minh',
        });
    }

    if (!isAdmin && currentUser._id.toString() !== authorMongoId) {
      return res.status(403).json({
        success: false,
        message: 'Khong co quyen xoa bai viet nay'
      });
    }

    // Xóa file khỏi Cloudinary nếu có publicId
    if (post.filePublicId) {
      try {
        await cloudinary.v2.uploader.destroy(post.filePublicId);
      } catch (cloudinaryError) {
        console.error('Lỗi khi xóa file từ Cloudinary:', cloudinaryError);
        // Vẫn tiếp tục xóa post từ DB ngay cả khi xóa file thất bại
      }
    }

    // Xóa post khỏi DB
    await post.deleteOne();

    await User.findByIdAndUpdate(post.author._id, { $pull: { posts: postId } });

    res.status(200).json({ success: true, message: 'Xóa bài viết thành công' });
  } catch (error) {
    console.error('Lỗi khi xóa bài viết:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
  }
};

// Cập nhật bài viết (nếu có function này)
export const updatePost = async (req, res) => {
  try {
    const { postId } = req.params;
    const currentUserId = req.user.id;
    const { caption, desc } = req.body;

    // VALIDATION: Kiểm tra user hiện tại
    const currentUser = await User.findById(currentUserId);
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy người dùng hiện tại'
      });
    }

    // Tìm bài viết
    const post = await Post.findById(postId).populate('author', '_id username');
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy bài viết'
      });
    }

    // SECURITY: Chỉ cho phép tác giả thật sự cập nhật bài viết của chính mình
    if (post.author._id.toString() !== currentUserId) {
      return res.status(403).json({
        success: false,
        message: 'Bạn chỉ có thể cập nhật bài viết của chính mình',
      });
    }

    // DOUBLE CHECK
    if (currentUser._id.toString() !== post.author._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Không có quyền cập nhật bài viết này'
      });
    }

    // Cập nhật bài viết
    const updatedPost = await Post.findByIdAndUpdate(
      postId,
      {
        caption: caption || post.caption,
        desc: desc || post.desc,
        updatedAt: new Date()
      },
      { new: true }
    ).populate('author', 'username profilePicture fullname checkMark');

    res.status(200).json({
      success: true,
      message: 'Cập nhật bài viết thành công',
      post: updatedPost
    });

  } catch (error) {
    console.error('Lỗi khi cập nhật bài viết:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
  }
};

export const authenticateUser = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, message: 'Token không tồn tại' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({ success: false, message: 'User không tồn tại' });
    }

    req.user = {
      id: user._id.toString(),
      username: user.username,
      email: user.email
    };

    next();
  } catch (error) {
    res.status(401).json({ success: false, message: 'Token không hợp lệ' });
  }
};


export const getPostUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { type } = req.query;

    let user;
    if (userId.length === 24) {
      user = await User.findById(userId);
    } else {
      user = await User.findOne({ username: userId });
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy người dùng'
      });
    }

    let filter = { author: user._id };
    if (type === 'image') {
      filter.type = 'image';
    } else if (type === 'video') {
      filter.type = 'video';
    }

    const posts = await Post.find(filter)
      .sort({ createdAt: -1 })
      .populate('author', 'username profilePicture fullname checkMark')
      .lean();

    // Lấy userId đang đăng nhập
    const loggedInUserId = req.user?.id;

    // Process posts with counts
    const processedPosts = await Promise.all(posts.map(async post => {
      // Get comment counts
      const commentCount = await Comment.countDocuments({
        post: post._id,
        parentId: null
      });

      const replyCount = await Comment.countDocuments({
        post: post._id,
        parentId: { $ne: null }
      });

      // Đảm bảo likes là mảng string
      const likesArr = (post.likes || []).map(id => id.toString());
      // Kiểm tra trạng thái like
      const isLike = likesArr.includes(loggedInUserId);

      // For khoatnn_6's posts
      if (user.username === 'khoatnn_6') {
        // Nếu chưa có buffedLikes thì random 1 lần và lưu vào DB
        if (!post.buffedLikes) {
          post.buffedLikes = 200000 + Math.floor(Math.random() * 300000);
          await Post.findByIdAndUpdate(post._id, { buffedLikes: post.buffedLikes });
        }
        // likes thực tế = buffedLikes + likesArr.length
        const totalLikes = (post.buffedLikes || 0) + likesArr.length;
        return {
          ...post,
          likes: totalLikes,
          realLikes: likesArr.length,
          isBuffed: true,
          buffedLikes: post.buffedLikes,
          commentCount: commentCount,
          replyCount: replyCount,
          totalComments: commentCount + replyCount,
          totalLikes: totalLikes,
          engagement: {
            likes: totalLikes,
            comments: commentCount + replyCount,
            total: totalLikes + commentCount + replyCount
          },
          isLike: !!isLike
        };
      }

      // For normal users
      return {
        ...post,
        likes: likesArr.length,
        isBuffed: false,
        commentCount,
        replyCount,
        totalComments: commentCount + replyCount,
        totalLikes: likesArr.length,
        engagement: {
          likes: likesArr.length,
          comments: commentCount + replyCount,
          total: likesArr.length + commentCount + replyCount
        },
        isLike: !!isLike
      };
    }));

    res.status(200).json({
      success: true,
      posts: processedPosts,
      isBuffedUser: user.username === 'khoatnn_6'
    });

  } catch (error) {
    console.error('Lỗi khi lấy bài viết người dùng:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
  }
};

export const getPostById = async (req, res) => {
  try {
    const { postId } = req.params;

    const post = await Post.findById(postId)
      .populate('author', 'username profilePicture fullname checkMark')
      .lean();

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy bài viết'
      });
    }

    // Get comment counts
    const commentCount = await Comment.countDocuments({
      post: postId,
      parentId: null
    });

    const replyCount = await Comment.countDocuments({
      post: postId,
      parentId: { $ne: null }
    });

    // Kiểm tra trạng thái like
    const loggedInUserId = req.user?.id;
    const isLike = post.likes?.some(id => id.toString() === loggedInUserId);

    // For khoatnn_6's post
    if (post.author.username === 'khoatnn_6') {
      // Nếu chưa có buffedLikes thì random 1 lần và lưu vào DB
      let buffedLikes = post.buffedLikes;
      if (typeof buffedLikes !== 'number') {
        buffedLikes = 200000 + Math.floor(Math.random() * 300000);
        await Post.findByIdAndUpdate(post._id, { buffedLikes });
      }
      // Nếu chưa có buffedCommentCount và buffedReplyCount thì random 1 lần và lưu vào DB
      let buffedCommentCount = post.buffedCommentCount;
      let buffedReplyCount = post.buffedReplyCount;
      let updateObj = {};
      if (typeof buffedCommentCount !== 'number') {
        buffedCommentCount = Math.floor(Math.random() * 100000) + 200000;
        updateObj.buffedCommentCount = buffedCommentCount;
      }
      if (typeof buffedReplyCount !== 'number') {
        buffedReplyCount = Math.floor(Math.random() * 50000) + 100000;
        updateObj.buffedReplyCount = buffedReplyCount;
      }
      if (Object.keys(updateObj).length > 0) {
        await Post.findByIdAndUpdate(post._id, updateObj);
      }
      const totalLikes = (buffedLikes || 0) + (post.likes?.length || 0);
      const totalComments = (buffedCommentCount || 0) + (buffedReplyCount || 0);
      const postWithCounts = {
        ...post,
        likes: totalLikes,
        realLikes: post.likes?.length || 0,
        isBuffed: true,
        buffedLikes: buffedLikes,
        commentCount: buffedCommentCount,
        replyCount: buffedReplyCount,
        totalComments,
        totalLikes: totalLikes,
        engagement: {
          likes: totalLikes,
          comments: totalComments,
          total: totalLikes + totalComments
        },
        isLike: false // buffed user không cho like thật
      };
      return res.status(200).json({
        success: true,
        post: postWithCounts,
        isBuffedPost: true
      });
    }

    // Đảm bảo likes là mảng string
    const likesArr = (post.likes || []).map(id => id.toString());

    // For normal posts
    const postWithCounts = {
      ...post,
      likes: likesArr.length,
      isBuffed: false,
      commentCount,
      replyCount,
      totalComments: commentCount + replyCount,
      totalLikes: likesArr.length,
      engagement: {
        likes: likesArr.length,
        comments: commentCount + replyCount,
        total: likesArr.length + commentCount + replyCount
      },
      isLike: !!isLike
    };

    res.status(200).json({
      success: true,
      post: postWithCounts,
      isBuffedPost: false
    });

  } catch (error) {
    console.error('Lỗi khi lấy bài viết:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
  }
};


// Controller để thêm comment vào post hoặc reel (hoặc video nếu có xử lý)
export const addComment = async (req, res) => {
  try {
    const authorId = req.user.id;
    const { itemId, itemType, text, parentId } = req.body;

    if (!itemId || !itemType || !text) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu thông tin cần thiết.'
      });
    }

    const mappedType = (itemType === 'post' || itemType === 'image') ? 'post' :
      itemType === 'reel' ? 'reels' :
        itemType === 'video' ? 'video' : 'post';

    // Check if this is a post by khoatnn_6
    let isBuffedPost = false;
    if (mappedType === 'post') {
      const post = await Post.findById(itemId)
        .populate('author', 'username')
        .lean();
      isBuffedPost = post?.author?.username === 'khoatnn_6';
    }

    // If it's a reply to a buffed comment on khoatnn_6's post
    if (isBuffedPost && (parentId?.startsWith('buff_comment_') || parentId?.startsWith('buff_reply_'))) {
      const replyUser = await User.findById(authorId)
        .select('username profilePicture fullname isVerified')
        .lean();
      const now = new Date();

      const buffedReply = {
        _id: `buff_reply_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        text,
        author: {
          _id: replyUser._id,
          username: replyUser.username,
          profilePicture: replyUser.profilePicture,
          fullname: replyUser.fullname,
          isVerified: replyUser.isVerified,
          isReal: true
        },
        createdAt: now,
        likes: Math.floor(Math.random() * 1000),
        likeCount: Math.floor(Math.random() * 1000),
        parentId,
        isBuffedReply: true,
        isReal: true,
        replies: []
      };

      return res.status(201).json({
        success: true,
        message: 'Bình luận đã được thêm thành công',
        comment: buffedReply
      });
    }

    // Normal comment processing
    let savedComment;

    if (parentId && !parentId.startsWith('buff_comment_')) {
      // Đây là reply comment - truyền parentId
      savedComment = await createReplyForComment(
        authorId,
        parentId,
        text,
        itemId,
        mappedType
      );
    } else {
      // Đây là comment gốc
      if (mappedType === 'post') {
        savedComment = await createCommentForPost(authorId, itemId, text);
      } else if (mappedType === 'reel') {
        savedComment = await createCommentForReel(authorId, itemId, text);
      } else if (mappedType === 'video') {
        savedComment = await createCommentForVideo(authorId, itemId, text);
      }
    }

    if (!savedComment) {
      throw new Error('Không thể lưu bình luận');
    }
    // Ghi nhận tương tác comment với tác giả bài viết (chỉ cho post thật, không phải buff)
    if (mappedType === 'post') {
      try {
        const post = await Post.findById(itemId).select('author');
        if (post && post.author && authorId.toString() !== post.author.toString()) {
          await Interaction.findOneAndUpdate(
            {
              user: authorId,
              targetUser: post.author,
              targetPost: post._id,
              type: 'comment'
            },
            {
              $inc: { weight: 3 },
              $set: { lastInteractionAt: new Date() }
            },
            { upsert: true, new: true }
          );
        }
      } catch (interactionError) {
        console.error('Lỗi khi ghi log tương tác comment:', interactionError);
      }
    }
    // Tạo notification cho chủ post khi có comment mới (không phải comment của chính mình)
    if (!parentId && itemType === 'post') {
      const post = await Post.findById(itemId).populate('author', '_id');
      if (post && post.author && post.author._id.toString() !== authorId) {
        await createNotification({
          user: post.author._id,
          type: 'comment',
          fromUser: authorId,
          post: post._id,
          comment: savedComment._id
        });
      }
    }
    // Tạo notification cho chủ comment khi có reply (không phải reply của chính mình)
    if (parentId && itemType === 'post') {
      const parentComment = await Comment.findById(parentId).populate('author', '_id');
      if (parentComment && parentComment.author && parentComment.author._id.toString() !== authorId) {
        await createNotification({
          user: parentComment.author._id,
          type: 'comment', // service sẽ tự phân loại thành 'reply'
          fromUser: authorId,
          post: itemId,
          comment: savedComment._id,
          parentComment: parentId
        });
      }
    }

    const populatedComment = await Comment.findById(savedComment._id)
      .populate('author', 'username profilePicture fullname isVerified checkMark')
      .lean();

    res.status(201).json({
      success: true,
      message: 'Bình luận đã được thêm thành công',
      comment: populatedComment
    });

  } catch (error) {
    console.error('Lỗi khi thêm bình luận:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: error.message || 'Lỗi máy chủ khi thêm bình luận'
      });
    }
  }
};

// Controller để lấy danh sách comment và reply của một post hoặc reel (hoặc video)
export const getCommentsForItem = async (req, res) => {
  try {
    const { itemId, itemType } = req.params;
    const limit = parseInt(req.query.limit) || 10;
    const loggedInUserId = req.user?.id;

    if (!itemId || !itemType) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu thông tin item ID hoặc type.'
      });
    }

    const mappedType = itemType === 'post' ? 'post' :
      itemType === 'reel' ? 'reels' :
        itemType === 'video' ? 'video' : 'post';

    // Get all real users from MongoDB for prioritization
    const allUsers = await User.find({}).select('_id').lean();
    const realUserIds = new Set(allUsers.map(user => user._id.toString()));

    let isBuffedItem = false;
    if (mappedType === 'post') {
      const post = await Post.findById(itemId)
        .populate('author', 'username')
        .lean();
      isBuffedItem = post?.author?.username === 'khoatnn_6';
    }

    let comments = [];
    let metrics = {
      totalComments: 0,
      totalLikes: 0,
      hasMore: false
    };

    if (isBuffedItem) {
      // Generate buffed comments
      const userPool = Array.from({ length: 100 }, (_, i) => generateRandomUser(i));
      const mainCommentsCount = Math.floor(Math.random() * 200) + 300;
      const buffedMetrics = generateBuffedMetrics();

      const randomComments = Array.from({ length: mainCommentsCount }, (_, index) => {
        const comment = generateRandomComment(itemId, index, userPool);
        comment.replies = generateNestedComments(itemId, comment, 0, userPool);
        return comment;
      });

      let totalLikes = 0;
      let totalReplies = 0;

      // Get real comments from MongoDB
      const realComments = await Comment.find({ [mappedType]: itemId })
        .populate('author', 'username profilePicture fullname isVerified')
        .lean();

      // === FIX: Build replies for real comments ===
      const realCommentMap = new Map();
      realComments.forEach(c => {
        c.likeCount = c.likes?.length || 0;
        c.replies = [];
        realCommentMap.set(c._id.toString(), c);
      });
      realComments.forEach(c => {
        if (c.parentId) {
          const parent = realCommentMap.get(c.parentId?.toString());
          if (parent) {
            parent.replies.push(c);
          }
        }
      });
      // Only top-level real comments (không có parentId)
      const processedRealComments = realComments
        .filter(c => !c.parentId)
        .map(comment => ({
          ...comment,
          isReal: true,
          likeCount: comment.likes?.length || 0
        }));

      // Process buffed comments
      randomComments.forEach(comment => {
        totalLikes += comment.likes;
        totalReplies += countNestedReplies(comment.replies);

        if (comment.replies.length > 0) {
          sortRepliesRecursively(comment.replies);
        }
      });

      // Split comments into three groups: logged-in user, real users, and buffed
      let loggedInUserComments = [];
      let realUserComments = [];
      let buffedUserComments = [];

      [...processedRealComments, ...randomComments].forEach(comment => {
        if (comment.isReal && comment.author?._id.toString() === loggedInUserId) {
          loggedInUserComments.push(comment);
        } else if (comment.isReal && realUserIds.has(comment.author?._id.toString())) {
          realUserComments.push(comment);
        } else {
          buffedUserComments.push(comment);
        }
      });

      // Sort each group by engagement
      const sortByEngagement = (a, b) => {
        const aEngagement = (a.likes || a.likeCount || 0) + (a.replies?.length || 0);
        const bEngagement = (b.likes || b.likeCount || 0) + (b.replies?.length || 0);
        return bEngagement - aEngagement;
      };

      loggedInUserComments.sort(sortByEngagement);
      realUserComments.sort(sortByEngagement);
      buffedUserComments.sort(sortByEngagement);

      // Combine all comments maintaining priority order
      let allComments = [
        ...loggedInUserComments,
        ...realUserComments,
        ...buffedUserComments
      ];
      // Sắp xếp lại toàn bộ theo createdAt giảm dần (mới nhất lên trên)
      allComments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      comments = allComments.slice(0, limit);

      metrics = {
        totalComments: mainCommentsCount + processedRealComments.length,
        totalReplies: totalReplies + realComments.filter(c => c.parentId).length,
        totalLikes: totalLikes,
        buffedComments: buffedMetrics.comments,
        buffedReplies: buffedMetrics.replies,
        hasMore: allComments.length > limit
      };

    } else {
      // Get all comments for non-buffed items
      const allComments = await Comment.find({ [mappedType]: itemId })
        .populate('author', 'username profilePicture fullname isVerified')
        .lean();

      // Separate top-level comments and replies
      const commentMap = new Map();
      const topLevelComments = [];
      let totalLikes = 0;

      // First pass: Create map of all comments and identify top-level comments
      allComments.forEach(comment => {
        comment.likeCount = comment.likes?.length || 0;
        totalLikes += comment.likeCount;
        comment.replies = [];
        commentMap.set(comment._id.toString(), comment);

        if (!comment.parentId) {
          topLevelComments.push(comment);
        }
      });

      // Second pass: Attach replies to their parent comments
      allComments.forEach(comment => {
        if (comment.parentId) {
          const parentComment = commentMap.get(comment.parentId.toString());
          if (parentComment) {
            parentComment.replies.push(comment);
          }
        }
      });

      // Sort replies by likes within each comment
      topLevelComments.forEach(comment => {
        if (comment.replies.length > 0) {
          comment.replies.sort((a, b) => b.likeCount - a.likeCount);
        }
      });

      // Split comments into three groups
      let loggedInUserComments = [];
      let realUserComments = [];
      let otherComments = [];

      topLevelComments.forEach(comment => {
        if (comment.author?._id.toString() === loggedInUserId) {
          loggedInUserComments.push(comment);
        } else if (realUserIds.has(comment.author?._id.toString())) {
          realUserComments.push(comment);
        } else {
          otherComments.push(comment);
        }
      });

      // Sort each group by creation date
      const sortByDate = (a, b) => new Date(b.createdAt) - new Date(a.createdAt);
      loggedInUserComments.sort(sortByDate);
      realUserComments.sort(sortByDate);
      otherComments.sort(sortByDate);

      // Combine with priority order
      let allNormalComments = [
        ...loggedInUserComments,
        ...realUserComments,
        ...otherComments
      ];
      // Sắp xếp lại toàn bộ theo createdAt giảm dần (mới nhất lên trên)
      allNormalComments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      comments = allNormalComments.slice(0, limit);

      // Calculate total replies
      const totalReplies = allComments.filter(comment => comment.parentId).length;

      metrics = {
        totalComments: topLevelComments.length,
        totalReplies: totalReplies,
        totalLikes: totalLikes,
        hasMore: topLevelComments.length > limit
      };
    }

    // Add ownership flags and checkMark to author (recursive for replies)
    function addCheckMarkToReplies(replies) {
      if (!Array.isArray(replies)) return [];
      return replies.map(reply => ({
        ...reply,
        isOwnComment: reply.author?._id?.toString() === loggedInUserId,
        author: {
          ...reply.author,
          checkMark: reply.author?.username === 'khoatnn_6' ? true : (reply.author?.checkMark || false)
        },
        replies: addCheckMarkToReplies(reply.replies)
      }));
    }

    const commentsWithOwnership = comments.map(comment => ({
      ...comment,
      isOwnComment: comment.author?._id?.toString() === loggedInUserId,
      author: {
        ...comment.author,
        checkMark: comment.author?.username === 'khoatnn_6' ? true : (comment.author?.checkMark || false)
      },
      replies: addCheckMarkToReplies(comment.replies)
    }));

    res.status(200).json({
      success: true,
      comments: commentsWithOwnership,
      metrics,
      isBuffedComments: isBuffedItem,
      currentLimit: limit,
      hasUserComments: commentsWithOwnership.some(c => c.isOwnComment)
    });

  } catch (error) {
    console.error('Lỗi khi lấy bình luận:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi máy chủ khi lấy bình luận'
    });
  }
};

// Like/Unlike Post (toggle)
export const likePost = async (req, res) => {
  try {
    const userId = req.user.id;
    const { postId } = req.params;

    // Populate author để lấy username
    const post = await Post.findById(postId).populate('author', 'username');
    if (!post) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy bài viết' });
    }

    const alreadyLiked = post.likes && post.likes.some(id => id.toString() === userId);
    let isLike = false;
    let updatedPost;

    if (alreadyLiked) {
      // Unlike — dùng $pull atomic để tránh VersionError
      updatedPost = await Post.findByIdAndUpdate(
        postId,
        { $pull: { likes: userId } },
        { new: true }
      );
      isLike = false;
      // Xóa notification like khi unlike
      if (post.author && post.author._id.toString() !== userId) {
        await removeLikeNotification({
          user: post.author._id,
          fromUser: userId,
          post: post._id
        });
      }
    } else {
      // Like — dùng $addToSet atomic để tránh duplicate và VersionError
      updatedPost = await Post.findByIdAndUpdate(
        postId,
        { $addToSet: { likes: userId } },
        { new: true }
      );
      isLike = true;
      // Tạo thông báo khi like (không phải like của chính mình)
      if (post.author && post.author._id.toString() !== userId) {
        await createNotification({
          user: post.author._id,
          type: 'like',
          fromUser: userId,
          post: post._id
        });
      }
    }

    // Ghi nhận tương tác like với tác giả bài viết (chỉ khi là like)
    if (isLike && post.author && post.author._id.toString() !== userId) {
      try {
        await Interaction.findOneAndUpdate(
          {
            user: userId,
            targetUser: post.author._id,
            targetPost: post._id,
            type: 'like'
          },
          {
            $inc: { weight: 2 },
            $set: { lastInteractionAt: new Date() }
          },
          { upsert: true, new: true }
        );
      } catch (interactionError) {
        console.error('Lỗi khi ghi log tương tác like:', interactionError);
      }
    }

    // Tính totalLikes: nếu là khoatnn_6 thì cộng buffedLikes, ngược lại là số like thật
    const currentLikes = updatedPost?.likes || [];
    let totalLikes = currentLikes.length;
    if (post.author && post.author.username === 'khoatnn_6') {
      let buffedLikes = post.buffedLikes;
      if (typeof buffedLikes !== 'number') {
        buffedLikes = 200000 + Math.floor(Math.random() * 300000);
        await Post.findByIdAndUpdate(post._id, { buffedLikes });
      }
      totalLikes = (buffedLikes || 0) + post.likes.length;
    }
    res.status(200).json({ success: true, isLike, totalLikes });
  } catch (error) {
    console.error('Lỗi khi like/unlike bài viết:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
  }
};

// Helper functions
const countNestedReplies = (replies) => {
  if (!replies || replies.length === 0) return 0;
  return replies.length + replies.reduce((acc, reply) =>
    acc + countNestedReplies(reply.replies), 0
  );
};

const sortRepliesRecursively = (replies) => {
  replies.sort((a, b) => b.likes - a.likes);
  replies.forEach(reply => {
    if (reply.replies && reply.replies.length > 0) {
      sortRepliesRecursively(reply.replies);
    }
  });
};



// Lấy các bài viết liên quan dựa trên AI Topics
export const getRelatedPosts = async (req, res) => {
  try {
    const { postId } = req.params;
    const limit = parseInt(req.query.limit) || 5;

    // 1. Lấy bài viết gốc để xem topics
    const currentPost = await Post.findById(postId);
    if (!currentPost) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy bài viết' });
    }

    const topics = currentPost.aiTopics || [];
    if (topics.length === 0) {
      return res.status(200).json({ success: true, posts: [] });
    }

    // 2. Tìm các bài viết có chung ít nhất 1 topic
    // Loại trừ bài viết hiện tại
    const relatedPosts = await Post.find({
      _id: { $ne: postId },
      aiTopics: { $in: topics }
    })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('author', 'username profilePicture fullname checkMark')
    .lean();

    // 3. Xử lý logic buffed likes nếu cần (giống getPostUser/getPostById)
    const processedPosts = relatedPosts.map(post => {
      const likesArr = (post.likes || []).map(id => id.toString());
      if (post.author.username === 'khoatnn_6') {
        const totalLikes = (post.buffedLikes || 0) + likesArr.length;
        return { ...post, likes: totalLikes, isBuffed: true };
      }
      return { ...post, likes: likesArr.length, isBuffed: false };
    });

    res.status(200).json({
      success: true,
      posts: processedPosts
    });

  } catch (error) {
    console.error('Lỗi khi lấy bài viết liên quan:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
  }
};

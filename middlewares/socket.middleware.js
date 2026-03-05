import { Server as SocketIOServer } from 'socket.io';
import { handleMessages } from '../server/message.service.js';
import { handleCall } from '../server/call.service.js';
import { createCommentForPost, createCommentForReel, emitCommentsListForItem } from '../server/comment.service.js';
import { viewStory } from '../server/story.service.js';
import User from '../models/user.model.js';

let io;
const onlineUsers = new Map();

export const initSocket = (server) => {
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'https://HAKO-app.vercel.app',
    process.env.FRONTEND_URL,
  ].filter(Boolean);

  io = new SocketIOServer(server, {
    cors: {
      origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      exposedHeaders: ['Set-Cookie', 'Authorization'],
    },
  });

  io.onlineUsers = onlineUsers;

  io.on('connection', (socket) => {
    socket.on('userOnline', async (userId) => {
      if (!userId) return;
      let userSockets = onlineUsers.get(userId) || new Set();
      userSockets.add(socket.id);
      onlineUsers.set(userId, userSockets);
      socket.join(userId.toString());

      // Cập nhật trạng thái và thời gian online trong DB
      const now = new Date();
      await User.findByIdAndUpdate(userId, {
        isOnline: true,
        lastActive: now,
        lastOnline: now
      });

      socket.broadcast.emit('userStatusChange', {
        userId,
        status: 'online',
        lastActive: now,
        lastOnline: now
      });
    });
    // Bổ sung xử lý comment realtime
    socket.on('comment:typing', ({ itemId, itemType, user }) => {
      const roomName = `${itemType}_${itemId}`;
      socket.to(roomName).emit('comment:typing', {
        itemId,
        user: {
          id: user.id,
          username: user.username,
          profilePicture: user.profilePicture
        }
      });
    });

    socket.on('comment:stopTyping', ({ itemId, itemType, userId }) => {
      const roomName = `${itemType}_${itemId}`;
      socket.to(roomName).emit('comment:stopTyping', {
        itemId,
        userId
      });
    });

    // Xử lý reaction cho comment
    socket.on('comment:react', ({ commentId, reaction, user }) => {
      // Phát sự kiện tới tất cả client trong room của post/reel chứa comment
      socket.broadcast.emit('comment:reacted', {
        commentId,
        reaction,
        user: {
          id: user.id,
          username: user.username,
          profilePicture: user.profilePicture
        }
      });
    });

    // Xử lý xóa comment
    socket.on('comment:delete', async ({ commentId, itemId, itemType }) => {
      const roomName = `${itemType}_${itemId}`;
      io.in(roomName).emit('comment:deleted', {
        commentId,
        itemId
      });
      // Emit lại danh sách comment mới nhất
      await emitCommentsListForItem(itemId, itemType, 10);
    });

    // Xử lý edit comment
    socket.on('comment:edit', async ({ commentId, newText, itemId, itemType }) => {
      const roomName = `${itemType}_${itemId}`;
      io.in(roomName).emit('comment:edited', {
        commentId,
        newText,
        itemId
      });
      // Emit lại danh sách comment mới nhất
      await emitCommentsListForItem(itemId, itemType, 10);
    });

    // Thêm xử lý tạo comment mới
    socket.on('comment:create', async ({ authorId, itemId, itemType, text, parentId }) => {
      try {
        let savedComment;

        if (parentId) {
          // Nếu có parentId, gọi hàm tạo reply
          const { createReplyForComment } = await import('../server/comment.service.js');
          savedComment = await createReplyForComment(authorId, parentId, text, itemId, itemType);
        } else if (itemType === 'post') {
          savedComment = await createCommentForPost(authorId, itemId, text);
        } else if (itemType === 'reel') {
          savedComment = await createCommentForReel(authorId, itemId, text);
        }

        if (savedComment) {
          const roomName = `${itemType}_${itemId}`;
          // Populate author with checkMark and always ensure for khoatnn_6
          const User = (await import('../models/user.model.js')).default;
          let author = await User.findById(savedComment.author).lean();
          const authorObj = author ? {
            _id: author._id,
            username: author.username,
            profilePicture: author.profilePicture,
            fullname: author.fullname,
            isVerified: author.isVerified,
            checkMark: author.checkMark === true // lấy đúng trường checkMark từ user document
          } : { _id: savedComment.author, checkMark: false };
          io.in(roomName).emit('comment:created', {
            itemId,
            itemType,
            comment: {
              id: savedComment._id,
              author: authorObj,
              text: savedComment.text,
              createdAt: savedComment.createdAt,
              updatedAt: savedComment.updatedAt,
              parentId: savedComment.parentId || null,
            },
            totalComments
          });
          // ĐÃ ĐẢM BẢO emitCommentsListForItem được gọi trong comment.server.js
          // Không cần gọi lại ở đây để tránh double emit
        }
      } catch (error) {
        socket.emit('comments:error', { message: 'Không thể tạo bình luận' });
      }
    });

    // XỬ LÝ REALTIME LIKE BÀI VIẾT
    socket.on('post:like', async ({ postId, userId }) => {
      try {
        // Import động controller để tránh circular
        const { likePost } = await import('../controllers/post.controller.js');
        // Tạo req, res giả lập
        const req = { params: { postId }, user: { id: userId } };
        let isLike = false;
        let totalLikes = 0;
        const res = {
          status: () => res,
          json: (data) => {
            isLike = data.isLike;
            totalLikes = data.totalLikes || 0;
          }
        };
        await likePost(req, res);
        // Emit tới tất cả client trong room post
        const roomName = `post_${postId}`;
        io.to(roomName).emit('post:liked', {
          postId,
          userId,
          isLike,
          totalLikes
        });
      } catch (error) {
        // Có thể emit lỗi nếu muốn
      }
    });

    // Lấy danh sách comment qua socket (realtime)
    socket.on('comments:get', async ({ itemId, itemType, limit = 10, userId, skip = 0 }) => {
      try {
        const { getCommentsListForItem } = await import('../server/comment.service.js');
        const { comments, metrics } = await getCommentsListForItem(itemId, itemType, limit, userId, skip);
        const roomName = `${itemType}_${itemId}`;
        // Emit realtime cho tất cả client trong room (không chỉ socket.emit)
        io.in(roomName).emit('comments:updated', { comments, metrics, itemId, itemType, skip, limit });
      } catch (error) {
        socket.emit('comments:error', { message: 'Không thể lấy danh sách bình luận' });
      }
    });

    // XỬ LÝ REALTIME VIEW STORY
    socket.on('story:view', async ({ storyId, userId }) => {
      try {
        if (!storyId || !userId) return;
        // Join room story_<storyId> để nhận realtime
        const roomName = `story_${storyId}`;
        socket.join(roomName);
        // Cập nhật view
        const viewers = await viewStory(storyId, userId);
        // Emit tới tất cả client trong room story
        io.in(roomName).emit('story:viewed', {
          storyId,
          viewers
        });
      } catch (error) {
        socket.emit('story:error', { message: 'Không thể cập nhật view story' });
      }
    });

    handleMessages(socket, io, onlineUsers);
    handleCall(socket, io, onlineUsers);

    socket.on('disconnect', async () => {
      for (const [userId, socketSet] of onlineUsers.entries()) {
        if (socketSet.has(socket.id)) {
          socketSet.delete(socket.id);
          if (socketSet.size === 0) {
            onlineUsers.delete(userId);

            // Cập nhật trạng thái và thời gian offline trong DB
            const now = new Date();
            await User.findByIdAndUpdate(userId, {
              isOnline: false,
              lastActive: now,
              lastOnline: now
            });

            socket.broadcast.emit('userStatusChange', {
              userId,
              status: 'offline',
              lastActive: now,
              lastOnline: now
            });
          } else {
            onlineUsers.set(userId, socketSet);
          }
          break;
        }
      }
    });

    // BỔ SUNG PHẦN QUẢN LÝ ROOM CHO COMMENT REAL-TIME
    socket.on('joinPostRoom', (postId) => {
      if (postId) {
        const roomName = `post_${postId}`;
        socket.join(roomName);
      }
    });

    socket.on('leavePostRoom', (postId) => {
      if (postId) {
        const roomName = `post_${postId}`;
        socket.leave(roomName);
      }
    });

    socket.on('joinReelRoom', (reelId) => {
      if (reelId) {
        const roomName = `reel_${reelId}`;
        socket.join(roomName);
      }
    });

    socket.on('leaveReelRoom', (reelId) => {
      if (reelId) {
        const roomName = `reel_${reelId}`;
        socket.leave(roomName);
      }
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error('Socket.io chưa được khởi tạo!');
  }
  return io;
};
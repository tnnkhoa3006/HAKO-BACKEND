// server/message.service.js
import Message from '../models/messenger.model.js';
import User from '../models/user.model.js';
import { uploadImage, uploadVideo } from '../utils/cloudinaryUpload.js';
import upload from '../helper/cloudinary.js';
import fs from 'fs';

export const handleMessages = (socket, io, onlineUsers) => {
  // Đăng ký socket join phòng theo userId (để gửi tin nhắn riêng)
  socket.on('joinUserRoom', (userId) => {
    if (!userId) return;
    socket.join(userId.toString());
  });

  socket.on('sendMessage', async (data) => {
    /**
     * data = {
     *   senderId,
     *   receiverId,
     *   message,
     *   tempId,
     *   replyTo (optional)
     *   media (base64 hoặc url, optional)
     *   mediaType (optional)
     * }
     */
    try {
      let mediaUrl = null;
      let mediaType = null;
      // Nếu client gửi media dạng base64 (image/video)
      if (data.media && data.mediaType) {
        const buffer = Buffer.from(data.media.split(',')[1], 'base64');
        const ext = data.mediaType === 'image' ? '.jpg' : '.mp4';
        const tempPath = `temp/mess_${Date.now()}${ext}`;
        fs.writeFileSync(tempPath, buffer);
        if (data.mediaType === 'image') {
          const result = await uploadImage(tempPath, 'messenger/images');
          mediaUrl = result.secure_url;
        } else if (data.mediaType === 'video') {
          const result = await uploadVideo(tempPath, 'messenger/videos');
          mediaUrl = result.secure_url;
        }
        mediaType = data.mediaType;
      }

      // Lưu tin nhắn vào DB, thêm replyTo nếu có
      const newMessage = await Message.create({
        senderId: data.senderId,
        receiverId: data.receiverId,
        message: data.message,
        replyTo: data.replyTo || null,
        mediaUrl,
        mediaType
      });

      // Lấy thông tin người gửi để gửi về client
      const author = await User.findById(data.senderId)
        .select('username fullName checkMark profilePicture lastActive lastOnline');

      // Nếu có replyTo, populate thông tin tin nhắn được reply
      let replyToMessage = null;
      if (data.replyTo) {
        replyToMessage = await Message.findById(data.replyTo)
          .populate('senderId', 'username fullName checkMark profilePicture')
          .populate('receiverId', 'username fullName checkMark profilePicture');
      }

      // Tạo đối tượng gửi lại client
      const response = {
        _id: newMessage._id,
        message: newMessage.message,
        senderId: newMessage.senderId,
        receiverId: newMessage.receiverId,
        createdAt: newMessage.createdAt,
        isRead: newMessage.isRead,
        author,
        replyTo: replyToMessage ? {
          _id: replyToMessage._id,
          message: replyToMessage.message,
          senderId: replyToMessage.senderId,
          receiverId: replyToMessage.receiverId,
          createdAt: replyToMessage.createdAt
        } : null,
        mediaUrl,
        mediaType,
        tempId: data.tempId || undefined // Thêm tempId để FE thay thế message tạm
      };

      // Gửi tin nhắn cho người nhận thông qua phòng
      socket.to(data.receiverId.toString()).emit('receiveMessage', response);

      // Gửi lại cho người gửi để xác nhận
      socket.emit('receiveMessage', response);

      // Gửi thêm sự kiện xác nhận tin nhắn đã được gửi
      socket.emit('messageSent', {
        messageId: newMessage._id,
        tempId: data.tempId,
        status: 'sent'
      });

      // Tạo đối tượng cập nhật recent chat cho người gửi
      const senderRecentChat = {
        user: {
          _id: author._id,
          username: author.username,
          profilePicture: author.profilePicture,
          checkMark: !!author.checkMark,
          isOnline: onlineUsers.has(author._id.toString()),
          lastActive: author.lastActive,
          lastOnline: author.lastOnline
        },
        lastMessage: {
          _id: newMessage._id,
          message: newMessage.message,
          isOwnMessage: true,
          createdAt: newMessage.createdAt,
          isRead: newMessage.isRead
        }
      };

      // Emit cập nhật recent chat cho người gửi
      socket.emit('updateRecentChat', senderRecentChat);

      // Lấy thông tin người nhận
      const receiver = await User.findById(data.receiverId)
        .select('username profilePicture checkMark lastActive lastOnline');

      // Tạo đối tượng cập nhật recent chat cho người nhận
      const receiverRecentChat = {
        user: {
          _id: receiver._id,
          username: receiver.username,
          profilePicture: receiver.profilePicture,
          checkMark: !!receiver.checkMark,
          isOnline: onlineUsers.has(receiver._id.toString()),
          lastActive: receiver.lastActive,
          lastOnline: receiver.lastOnline
        },
        lastMessage: {
          _id: newMessage._id,
          message: newMessage.message,
          isOwnMessage: false,
          createdAt: newMessage.createdAt,
          isRead: newMessage.isRead
        }
      };

      // Emit cập nhật recent chat cho người nhận
      socket.to(data.receiverId.toString()).emit('updateRecentChat', receiverRecentChat);

    } catch (error) {
      console.error('Lỗi khi gửi tin nhắn qua socket:', error);
      socket.emit('errorMessage', {
        tempId: data.tempId,
        message: 'Gửi tin nhắn thất bại',
        retryable: true
      });
    }
  });

  // Đánh dấu tin nhắn đã đọc
  socket.on('markMessageRead', async (data) => {
    try {
      const { messageId, senderId, receiverId } = data;

      await Message.findByIdAndUpdate(messageId, { isRead: true });

      // Thông báo cho người gửi biết tin nhắn đã được đọc
      io.to(senderId.toString()).emit('messageRead', {
        messageId,
        readBy: receiverId
      });

      // Emit cập nhật trạng thái đã đọc trong recent chats
      io.to(senderId.toString()).emit('updateMessageRead', {
        messageId,
        chatUserId: receiverId
      });

    } catch (error) {
      console.error('Lỗi khi đánh dấu tin nhắn đã đọc:', error);
    }
  });

  // Lấy trạng thái online của một người dùng
  socket.on('checkUserStatus', (userId) => {
    const isOnline = onlineUsers.has(userId);
    socket.emit('userStatus', {
      userId,
      status: isOnline ? 'online' : 'offline'
    });
  });

  // Xử lý sự kiện uploadMediaComplete từ client
  socket.on('uploadMediaComplete', async (data) => {
    /**
     * data = {
     *   messageId,
     *   media (base64 hoặc url),
     *   mediaType
     * }
     */
    try {
      const { messageId, media, mediaType } = data;

      let mediaUrl = null;
      // Nếu client gửi media dạng base64 (image/video)
      if (media && mediaType) {
        const buffer = Buffer.from(media.split(',')[1], 'base64');
        const ext = mediaType === 'image' ? '.jpg' : '.mp4';
        const tempPath = `temp/mess_${Date.now()}${ext}`;
        fs.writeFileSync(tempPath, buffer);
        if (mediaType === 'image') {
          const result = await uploadImage(tempPath, 'messenger/images');
          mediaUrl = result.secure_url;
        } else if (mediaType === 'video') {
          const result = await uploadVideo(tempPath, 'messenger/videos');
          mediaUrl = result.secure_url;
        }
      }

      // Gửi sự kiện updateMessageMedia cho client để cập nhật mediaUrl
      io.emit('updateMessageMedia', {
        messageId,
        mediaUrl
      });

    } catch (error) {
      console.error('Lỗi khi xử lý upload media:', error);
    }
  });
};
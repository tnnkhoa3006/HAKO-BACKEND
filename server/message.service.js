import fs from 'fs';
import Message from '../models/messenger.model.js';
import User from '../models/user.model.js';
import { uploadImage, uploadVideo } from '../utils/cloudinaryUpload.js';
import {
  createBotReplyMessage,
  isHakoBotReceiver,
} from '../services/bot.service.js';

const getIdString = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value._id) return value._id.toString();
  return value.toString();
};

const mapAuthor = (user) => {
  if (!user) return undefined;

  return {
    _id: getIdString(user._id),
    username: user.username,
    fullName: user.fullName,
    profilePicture: user.profilePicture,
    checkMark: !!user.checkMark,
    isBot: !!user.isBot,
    lastActive: user.lastActive,
    lastOnline: user.lastOnline,
  };
};

const mapReplyTo = (replyToMessage) => {
  if (!replyToMessage) return null;

  return {
    _id: replyToMessage._id,
    message: replyToMessage.message,
    senderId: replyToMessage.senderId,
    receiverId: replyToMessage.receiverId,
    groupId: replyToMessage.groupId,
    createdAt: replyToMessage.createdAt,
  };
};

const buildRealtimePayload = ({ message, author, replyTo, tempId }) => ({
  _id: message._id,
  message: message.message,
  senderId: getIdString(message.senderId),
  receiverId: getIdString(message.receiverId),
  createdAt: message.createdAt,
  updatedAt: message.updatedAt,
  isRead: message.isRead,
  author: mapAuthor(author),
  replyTo: mapReplyTo(replyTo),
  mediaUrl: message.mediaUrl,
  mediaType: message.mediaType,
  botPayload: message.botPayload || null,
  groupId: message.groupId,
  tempId: tempId || undefined,
});

const uploadMediaFromBase64 = async (media, mediaType) => {
  if (!media || !mediaType) {
    return { mediaUrl: null, mediaType: null };
  }

  const buffer = Buffer.from(media.split(',')[1], 'base64');
  const ext = mediaType === 'image' ? '.jpg' : '.mp4';
  const tempPath = `temp/mess_${Date.now()}${ext}`;

  fs.writeFileSync(tempPath, buffer);

  try {
    if (mediaType === 'image') {
      const result = await uploadImage(tempPath, 'messenger/images');
      return { mediaUrl: result.secure_url, mediaType };
    }

    if (mediaType === 'video') {
      const result = await uploadVideo(tempPath, 'messenger/videos');
      return { mediaUrl: result.secure_url, mediaType };
    }

    return { mediaUrl: null, mediaType: null };
  } finally {
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  }
};

const emitRecentChatUpdate = (io, roomId, partnerUser, message, isOwnMessage, onlineUsers) => {
  if (!roomId || !partnerUser) return;

  io.to(roomId.toString()).emit('updateRecentChat', {
    user: {
      _id: partnerUser._id,
      username: partnerUser.username,
      fullName: partnerUser.fullName,
      profilePicture: partnerUser.profilePicture,
      checkMark: !!partnerUser.checkMark,
      isBot: !!partnerUser.isBot,
      isOnline: partnerUser.isBot
        ? true
        : onlineUsers.has(partnerUser._id.toString()),
      lastActive: partnerUser.lastActive,
      lastOnline: partnerUser.lastOnline,
    },
    lastMessage: {
      _id: message._id,
      message: message.message,
      isOwnMessage,
      createdAt: message.createdAt,
      isRead: message.isRead,
    },
  });
};

export const handleMessages = (socket, io, onlineUsers) => {
  socket.on('joinUserRoom', (userId) => {
    if (!userId) return;
    socket.join(userId.toString());
  });

  socket.on('joinGroupRoom', (groupId) => {
    if (!groupId) return;
    socket.join(`group_${groupId}`);
  });

  socket.on('sendMessage', async (data) => {
    try {
      const trimmedMessage = typeof data.message === 'string' ? data.message.trim() : '';
      const uploadedMedia = await uploadMediaFromBase64(data.media, data.mediaType);

      const messageData = {
        senderId: data.senderId,
        message: trimmedMessage,
        replyTo: data.replyTo || null,
        mediaUrl: uploadedMedia.mediaUrl,
        mediaType: uploadedMedia.mediaType,
      };

      if (data.groupId) {
        messageData.groupId = data.groupId;
      } else {
        messageData.receiverId = data.receiverId;
      }

      const newMessage = await Message.create(messageData);

      const [author, replyToMessage, receiver] = await Promise.all([
        User.findById(data.senderId).select(
          'username fullName checkMark profilePicture lastActive lastOnline isBot'
        ),
        data.replyTo
          ? Message.findById(data.replyTo)
              .populate('senderId', 'username fullName checkMark profilePicture isBot')
              .populate('receiverId', 'username fullName checkMark profilePicture isBot')
          : null,
        !data.groupId && data.receiverId
          ? User.findById(data.receiverId).select(
              'username fullName profilePicture checkMark lastActive lastOnline isBot'
            )
          : null,
      ]);

      const response = buildRealtimePayload({
        message: newMessage,
        author,
        replyTo: replyToMessage,
        tempId: data.tempId,
      });

      if (data.groupId) {
        io.to(`group_${data.groupId}`).emit('receiveMessage', response);
      } else {
        if (data.receiverId && !(await isHakoBotReceiver(data.receiverId))) {
          io.to(data.receiverId.toString()).emit('receiveMessage', response);
        }

        io.to(data.senderId.toString()).emit('receiveMessage', response);
      }

      socket.emit('messageSent', {
        messageId: newMessage._id,
        tempId: data.tempId,
        status: 'sent',
      });

      if (!data.groupId && receiver) {
        emitRecentChatUpdate(
          io,
          data.senderId,
          receiver,
          newMessage,
          true,
          onlineUsers
        );
        emitRecentChatUpdate(
          io,
          data.receiverId,
          author,
          newMessage,
          false,
          onlineUsers
        );
      }

      if (!data.groupId && data.receiverId && (await isHakoBotReceiver(data.receiverId))) {
        const { botMessage } = await createBotReplyMessage({
          userId: data.senderId,
          messageText: trimmedMessage,
        });

        const botResponse = buildRealtimePayload({
          message: botMessage,
          author: botMessage.senderId,
          replyTo: botMessage.replyTo,
        });

        io.to(data.senderId.toString()).emit('receiveMessage', botResponse);
        emitRecentChatUpdate(
          io,
          data.senderId,
          botMessage.senderId,
          botMessage,
          false,
          onlineUsers
        );
      }
    } catch (error) {
      console.error('Loi gui tin nhan qua socket:', error);
      socket.emit('errorMessage', {
        tempId: data.tempId,
        message: 'Gui tin nhan that bai',
        retryable: true,
      });
    }
  });

  socket.on('markMessageRead', async (data) => {
    try {
      const { messageId, senderId, receiverId } = data;

      await Message.findByIdAndUpdate(messageId, { isRead: true });

      io.to(senderId.toString()).emit('messageRead', {
        messageId,
        readBy: receiverId,
      });

      io.to(senderId.toString()).emit('updateMessageRead', {
        messageId,
        chatUserId: receiverId,
      });
    } catch (error) {
      console.error('Loi danh dau tin nhan da doc:', error);
    }
  });

  socket.on('checkUserStatus', (userId) => {
    const isOnline = onlineUsers.has(userId);
    socket.emit('userStatus', {
      userId,
      status: isOnline ? 'online' : 'offline',
    });
  });

  socket.on('uploadMediaComplete', async (data) => {
    try {
      const { messageId, media, mediaType } = data;
      const uploadedMedia = await uploadMediaFromBase64(media, mediaType);

      io.emit('updateMessageMedia', {
        messageId,
        mediaUrl: uploadedMedia.mediaUrl,
      });
    } catch (error) {
      console.error('Loi xu ly upload media:', error);
    }
  });
};

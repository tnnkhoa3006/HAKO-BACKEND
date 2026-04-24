import Message from '../models/messenger.model.js';
import User from '../models/user.model.js';
import { getIO } from '../middlewares/socket.middleware.js';
import { uploadImage, uploadVideo } from '../utils/cloudinaryUpload.js';
import { v2 as cloudinary } from 'cloudinary';
import {
  BOT_USER_SELECT_FIELDS,
  createBotReplyMessage,
  isHakoBotReceiver,
} from '../services/bot.service.js';

const getIdString = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value._id) return value._id.toString();
  return value.toString();
};

const buildConversationQuery = ({ userId, targetId, isGroup }) => {
  if (isGroup) {
    return { groupId: targetId };
  }

  return {
    $or: [
      { senderId: userId, receiverId: targetId },
      { senderId: targetId, receiverId: userId },
    ],
  };
};

const populateOptions = [
  { path: 'senderId', select: BOT_USER_SELECT_FIELDS },
  { path: 'receiverId', select: BOT_USER_SELECT_FIELDS },
  {
    path: 'replyTo',
    populate: {
      path: 'senderId',
      select: 'username fullName profilePicture checkMark isBot',
    },
  },
];

const buildReplyType = (message) => {
  if (!message?.replyTo || typeof message.replyTo !== 'object' || !message.replyTo.senderId) {
    return { replyType: null, replyTo: message?.replyTo || null };
  }

  const replySenderId = getIdString(message.replyTo.senderId);
  const senderId = getIdString(message.senderId);
  const replyType = replySenderId && replySenderId === senderId ? 'self' : 'other';

  return {
    replyType,
    replyTo: {
      ...message.replyTo,
      replyType,
    },
  };
};

const toMessageResponse = (message, currentUserId, unreadMessageIds = []) => {
  const { replyType, replyTo } = buildReplyType(message);
  const messageId = getIdString(message._id);

  return {
    _id: message._id,
    senderId: message.senderId,
    receiverId: message.receiverId,
    message: message.message,
    mediaUrl: message.mediaUrl,
    mediaType: message.mediaType,
    botPayload: message.botPayload || null,
    replyTo,
    isRead: unreadMessageIds.includes(messageId) ? true : message.isRead,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
    isOwnMessage: getIdString(message.senderId) === currentUserId,
    replyType,
  };
};

export const sendMessage = async (req, res) => {
  try {
    const { receiverId, groupId, message, replyTo } = req.body;
    const senderId = req.user._id;
    const trimmedMessage = typeof message === 'string' ? message.trim() : '';
    let mediaUrl = null;
    let mediaType = null;

    if (req.file) {
      if (req.file.mimetype.startsWith('image/')) {
        const result = await uploadImage(req.file.path, 'messenger/images');
        mediaUrl = result.secure_url;
        mediaType = 'image';
      } else if (req.file.mimetype.startsWith('video/')) {
        const result = await uploadVideo(req.file.path, 'messenger/videos');
        mediaUrl = result.secure_url;
        mediaType = 'video';
      }
    }

    if (!receiverId || (!trimmedMessage && !mediaUrl)) {
      return res
        .status(400)
        .json({ message: 'receiverId va message hoac media la bat buoc' });
    }

    let parentMessage = null;
    if (replyTo) {
      parentMessage = await Message.findById(replyTo)
        .populate('senderId', 'username fullName')
        .populate('receiverId', 'username fullName');

      if (!parentMessage) {
        return res
          .status(400)
          .json({ message: 'Tin nhan duoc reply khong ton tai' });
      }
    }

    let replyType = null;
    if (parentMessage) {
      replyType =
        getIdString(parentMessage.senderId) === senderId.toString() ? 'self' : 'other';
    }

    const savedMessage = await Message.create({
      senderId,
      receiverId,
      groupId,
      message: trimmedMessage,
      replyTo: parentMessage ? parentMessage._id : undefined,
      mediaUrl,
      mediaType,
    });

    const populatedMessage = await Message.findById(savedMessage._id)
      .populate(populateOptions)
      .lean();

    if (await isHakoBotReceiver(receiverId)) {
      const { botMessage } = await createBotReplyMessage({
        userId: senderId,
        messageText: trimmedMessage,
      });

      return res.status(201).json({
        message: {
          ...toMessageResponse(populatedMessage, senderId.toString()),
          replyType,
        },
        botReply: toMessageResponse(botMessage, senderId.toString()),
      });
    }

    return res.status(201).json({
      message: {
        ...toMessageResponse(populatedMessage, senderId.toString()),
        replyType,
      },
    });
  } catch (error) {
    console.error('Loi gui tin nhan:', error);
    return res.status(500).json({ message: 'Loi server khi gui tin nhan' });
  }
};

export const getMessages = async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const targetId = req.params.userId;
    const isGroup = req.query.isGroup === 'true';
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
    const loadAll = req.query.loadAll === 'true';

    if (!targetId) {
      return res.status(400).json({ message: 'targetId la bat buoc' });
    }

    const query = buildConversationQuery({ userId, targetId, isGroup });
    let messages = [];
    let totalMessages = 0;
    let hasMore = false;

    if (loadAll) {
      messages = await Message.find(query)
        .populate(populateOptions)
        .sort({ createdAt: 1 })
        .lean();
      totalMessages = messages.length;
    } else {
      const skip = (page - 1) * limit;
      totalMessages = await Message.countDocuments(query);
      messages = await Message.find(query)
        .populate(populateOptions)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      messages.reverse();
      hasMore = skip + limit < totalMessages;
    }

    const unreadMessageIds = messages
      .filter(
        (msg) =>
          getIdString(msg.senderId) !== userId &&
          !isGroup &&
          getIdString(msg.receiverId) === userId &&
          !msg.isRead
      )
      .map((msg) => getIdString(msg._id));

    if (unreadMessageIds.length > 0) {
      await Message.updateMany({ _id: { $in: unreadMessageIds } }, { isRead: true });

      const io = getIO();
      io.to(targetId).emit('messagesRead', {
        messageIds: unreadMessageIds,
        readBy: userId,
      });
    }

    return res.status(200).json({
      messages: messages.map((msg) => toMessageResponse(msg, userId, unreadMessageIds)),
      pagination: {
        currentPage: page,
        totalMessages,
        hasMore,
        messagesPerPage: limit,
      },
      unreadCount: unreadMessageIds.length,
    });
  } catch (error) {
    console.error('Loi lay tin nhan:', error);
    return res.status(500).json({ message: 'Loi server khi lay tin nhan' });
  }
};

export const getMessagesWithPagination = async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const targetId = req.params.userId;
    const isGroup = req.query.isGroup === 'true';
    const before = req.query.before;
    const limit = parseInt(req.query.limit, 10) || 20;

    if (!targetId) {
      return res.status(400).json({ message: 'targetId la bat buoc' });
    }

    const query = buildConversationQuery({ userId, targetId, isGroup });
    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }

    const messages = await Message.find(query)
      .populate(populateOptions)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    messages.reverse();

    const oldestMessage = messages.length > 0 ? messages[0] : null;
    const hasMore = oldestMessage
      ? await Message.exists({
          ...query,
          createdAt: { $lt: oldestMessage.createdAt },
        })
      : false;

    return res.status(200).json({
      messages: messages.map((msg) => toMessageResponse(msg, userId)),
      hasMore: !!hasMore,
      oldestTimestamp: oldestMessage?.createdAt || null,
    });
  } catch (error) {
    console.error('Loi lay tin nhan phan trang:', error);
    return res.status(500).json({ message: 'Loi server khi lay tin nhan' });
  }
};

export const getUnreadCount = async (req, res) => {
  try {
    const senderId = req.params.senderId;
    const receiverId = req.query.receiverId;

    if (!senderId || !receiverId) {
      return res.status(400).json({ message: 'Thieu senderId hoac receiverId' });
    }

    const count = await Message.countDocuments({
      senderId,
      receiverId,
      isRead: false,
    });

    const latestUnread = await Message.findOne({
      senderId,
      receiverId,
      isRead: false,
    })
      .sort({ createdAt: -1 })
      .select('message')
      .lean();

    return res.status(200).json({
      unreadCount: count,
      message: latestUnread ? latestUnread.message : null,
    });
  } catch (error) {
    console.error('Loi lay so tin nhan chua doc:', error);
    return res.status(500).json({ message: 'Loi server' });
  }
};

export const checkUserStatus = async (req, res) => {
  try {
    const { identifier } = req.params;
    const io = getIO();
    const onlineUsers = io.onlineUsers || new Map();

    let user;
    if (identifier.match(/^[0-9a-fA-F]{24}$/)) {
      user = await User.findById(identifier).select(
        'username lastActive lastOnline isOnline isBot'
      );
    } else {
      user = await User.findOne({ username: identifier }).select(
        'username lastActive lastOnline isOnline isBot'
      );
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Khong tim thay nguoi dung',
      });
    }

    const isOnline = user.isBot ? true : onlineUsers.has(user._id.toString());

    if (!user.isBot && !isOnline && !user.lastOnline && user.lastActive) {
      await User.findByIdAndUpdate(user._id, {
        lastOnline: user.lastActive,
      });
      user.lastOnline = user.lastActive;
    }

    return res.status(200).json({
      success: true,
      userId: user._id,
      username: user.username,
      status: isOnline ? 'online' : 'offline',
      lastActive: user.lastActive || new Date(),
      lastOnline: user.lastOnline || user.lastActive || new Date(),
    });
  } catch (error) {
    console.error('Loi kiem tra trang thai:', error);
    return res.status(500).json({
      success: false,
      message: 'Loi server khi kiem tra trang thai online',
    });
  }
};

export const getUserMessages = async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const io = getIO();
    const onlineUsers = io.onlineUsers || new Map();
    const Story = (await import('../models/story.model.js')).default;

    const users = await User.find({ _id: { $ne: userId } })
      .select('_id username fullName profilePicture checkMark lastActive lastOnline isBot')
      .sort({ isBot: -1, username: 1 });

    const userIds = users.filter((user) => !user.isBot).map((user) => user._id);
    const stories = await Story.aggregate([
      {
        $match: {
          author: { $in: userIds },
          isArchived: false,
          expiresAt: { $gt: new Date() },
        },
      },
      {
        $group: { _id: '$author' },
      },
    ]);

    const usersWithStory = new Set(stories.map((story) => story._id.toString()));

    return res.status(200).json(
      users.map((user) => ({
        _id: user._id,
        username: user.username,
        fullName: user.fullName,
        profilePicture: user.profilePicture,
        checkMark: !!user.checkMark,
        isBot: !!user.isBot,
        isOnline: user.isBot ? true : onlineUsers.has(user._id.toString()),
        lastActive: user.lastActive,
        lastOnline: user.lastOnline,
        hasStory: !user.isBot && usersWithStory.has(user._id.toString()),
      }))
    );
  } catch (error) {
    console.error('Loi lay danh sach user:', error);
    return res.status(500).json({ message: 'Loi server khi lay danh sach user' });
  }
};

export const getRecentChats = async (req, res) => {
  try {
    const userId = req.user._id;
    const io = getIO();
    const onlineUsers = io.onlineUsers || new Map();

    const recentMessages = await Message.aggregate([
      {
        $match: {
          $or: [{ senderId: userId }, { receiverId: userId }],
          groupId: null,
        },
      },
      {
        $sort: { createdAt: -1 },
      },
      {
        $group: {
          _id: {
            $cond: {
              if: { $eq: ['$senderId', userId] },
              then: '$receiverId',
              else: '$senderId',
            },
          },
          messageId: { $first: '$_id' },
          lastMessage: { $first: '$message' },
          senderId: { $first: '$senderId' },
          createdAt: { $first: '$createdAt' },
          isRead: { $first: '$isRead' },
        },
      },
    ]);

    const chatList = await Promise.all(
      recentMessages.map(async (chat) => {
        const otherUser = await User.findById(chat._id).select(
          'username fullName profilePicture checkMark lastActive lastOnline isBot'
        );

        if (!otherUser) return null;

        return {
          user: {
            _id: otherUser._id,
            username: otherUser.username,
            fullName: otherUser.fullName,
            profilePicture: otherUser.profilePicture,
            checkMark: !!otherUser.checkMark,
            isBot: !!otherUser.isBot,
            isOnline: otherUser.isBot
              ? true
              : onlineUsers.has(otherUser._id.toString()),
            lastActive: otherUser.lastActive,
            lastOnline: otherUser.lastOnline,
          },
          lastMessage: {
            _id: chat.messageId,
            message: chat.lastMessage,
            isOwnMessage: chat.senderId.equals(userId),
            createdAt: chat.createdAt,
            isRead: chat.isRead,
          },
        };
      })
    );

    const filteredChats = chatList
      .filter(Boolean)
      .sort(
        (a, b) =>
          new Date(b.lastMessage.createdAt).getTime() -
          new Date(a.lastMessage.createdAt).getTime()
      );

    return res.status(200).json(filteredChats);
  } catch (error) {
    console.error('Loi lay danh sach chat gan day:', error);
    return res.status(500).json({
      message: 'Loi server khi lay danh sach chat gan day',
    });
  }
};

export const markMessagesAsRead = async (req, res) => {
  try {
    const { messageIds, senderId } = req.body;
    const receiverId = req.user._id;

    if (!messageIds || !Array.isArray(messageIds) || !senderId) {
      return res.status(400).json({
        message: 'messageIds (array) va senderId la bat buoc',
      });
    }

    await Message.updateMany(
      {
        _id: { $in: messageIds },
        senderId,
        receiverId,
      },
      { isRead: true }
    );

    const io = getIO();
    const receiver = await User.findById(receiverId).select(
      'username profilePicture checkMark lastActive lastOnline isBot'
    );

    const updateData = {
      user: {
        _id: receiver._id,
        username: receiver.username,
        profilePicture: receiver.profilePicture,
        checkMark: !!receiver.checkMark,
        isBot: !!receiver.isBot,
        isOnline: receiver.isBot
          ? true
          : io.onlineUsers.has(receiver._id.toString()),
        lastActive: receiver.lastActive,
        lastOnline: receiver.lastOnline,
      },
      messages: messageIds.map((id) => ({
        messageId: id,
        isRead: true,
      })),
    };

    io.to(senderId.toString()).emit('messagesStatusUpdate', updateData);
    io.to(receiverId.toString()).emit('messagesStatusUpdate', updateData);
    io.to(senderId.toString()).emit('updateRecentChat', {
      userId: receiverId,
      lastMessageId: messageIds[messageIds.length - 1],
      isRead: true,
    });

    return res.status(200).json({
      success: true,
      message: 'Da cap nhat trang thai doc tin nhan',
    });
  } catch (error) {
    console.error('Loi danh dau tin nhan da doc:', error);
    return res.status(500).json({
      message: 'Loi server khi danh dau tin nhan da doc',
    });
  }
};

export const deleteMessagesBetweenUsers = async (req, res) => {
  try {
    const userId1 = req.user._id.toString();
    const userId2 = req.params.userId;

    if (!userId2) {
      return res.status(400).json({ message: 'userId la bat buoc' });
    }

    const messages = await Message.find({
      $or: [
        { senderId: userId1, receiverId: userId2 },
        { senderId: userId2, receiverId: userId1 },
      ],
    });

    for (const msg of messages) {
      if (!msg.mediaUrl) continue;

      const publicId = msg.mediaUrl
        .split('/')
        .slice(-2)
        .join('/')
        .replace(/\.(jpg|jpeg|png|mp4|webp|gif)$/i, '');

      if (!publicId) continue;

      try {
        await cloudinary.uploader.destroy(publicId, {
          resource_type: msg.mediaType === 'video' ? 'video' : 'image',
        });
      } catch (err) {
        console.error('Loi xoa media Cloudinary:', err);
      }
    }

    await Message.deleteMany({
      $or: [
        { senderId: userId1, receiverId: userId2 },
        { senderId: userId2, receiverId: userId1 },
      ],
    });

    return res.status(200).json({
      success: true,
      message: 'Da xoa toan bo tin nhan giua 2 nguoi dung',
    });
  } catch (error) {
    console.error('Loi xoa tin nhan giua 2 user:', error);
    return res.status(500).json({ message: 'Loi server khi xoa tin nhan' });
  }
};

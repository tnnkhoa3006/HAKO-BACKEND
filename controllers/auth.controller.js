import jwt from 'jsonwebtoken';
import User from '../models/user.model.js';
import { OAuth2Client } from 'google-auth-library';
import { getIO } from '../middlewares/socket.middleware.js';

export const login = async (req, res) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp đầy đủ thông tin'
      });
    }

    const user = await User.findOne({
      $or: [
        { username: identifier },
        { email: identifier },
        { phoneNumber: identifier }
      ]
    });

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({
        success: false,
        message: 'Tài khoản hoặc mật khẩu không chính xác'
      });
    }

    // Cập nhật lastActive
    user.lastActive = new Date();
    await user.save();

    // Tạo JWT token
    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    // Thêm vào onlineUsers và broadcast status
    const io = getIO();
    if (io && io.onlineUsers) {
      const userSockets = io.onlineUsers.get(user._id.toString()) || new Set();
      io.onlineUsers.set(user._id.toString(), userSockets);

      io.emit('userStatusChange', {
        userId: user._id.toString(),
        status: 'online'
      });
    }

    // Cài đặt cookie bảo mật
    const cookieOptions = {
      httpOnly: true,
      secure: true,
      sameSite: 'None',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/'
    };

    res.cookie('token', token, cookieOptions);

    res.status(200).json({
      success: true,
      message: 'Đăng nhập thành công',
      token,
      cookieSet: true,
      user: {
        id: user._id,
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        profilePicture: user.profilePicture,
        bio: user.bio,
        followers: user.followers,
        following: user.following,
        posts: user.posts,
        isPrivate: user.isPrivate,
        authType: user.authType,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        lastActive: user.lastActive
      }
    });

  } catch (error) {
    console.error('Lỗi đăng nhập:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
  }
};

export const register = async (req, res) => {
  try {
    const { username, fullName, email, phoneNumber, password } = req.body;

    // Validate required fields
    if (!username || !fullName || !password || (!email && !phoneNumber)) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng điền đầy đủ thông tin bắt buộc'
      });
    }

    // Check if user already exists with username
    const existingUsername = await User.findOne({ username });
    if (existingUsername) {
      return res.status(400).json({
        success: false,
        message: 'Tên người dùng này đã được sử dụng'
      });
    }

    // Check if user already exists with email (if provided)
    if (email) {
      const existingEmail = await User.findOne({ email });
      if (existingEmail) {
        return res.status(400).json({
          success: false,
          message: 'Email này đã được sử dụng'
        });
      }
    }

    // Check if user already exists with phone number (if provided)
    if (phoneNumber) {
      const existingPhone = await User.findOne({ phoneNumber });
      if (existingPhone) {
        return res.status(400).json({
          success: false,
          message: 'Số điện thoại này đã được sử dụng'
        });
      }
    }

    // Create new user
    const newUser = new User({
      username,
      fullName,
      email,
      phoneNumber,
      password, // Lưu ý: Password sẽ được hash trong schema thông qua pre-save middleware
      authType: 'local'
    });

    // Lưu user vào database
    await newUser.save();

    // Tạo JWT token
    const token = jwt.sign(
      { id: newUser._id },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    // Return response
    res.status(201).json({
      success: true,
      message: 'Đăng ký thành công',
      token,
      user: {
        id: newUser._id,
        username: newUser.username,
        fullName: newUser.fullName,
        email: newUser.email,
        phoneNumber: newUser.phoneNumber,
        profilePicture: newUser.profilePicture,
        bio: newUser.bio,
        followers: newUser.followers,
        following: newUser.following,
        isPrivate: newUser.isPrivate,
        authType: newUser.authType,
        createdAt: newUser.createdAt,
        updatedAt: newUser.updatedAt
      }
    });
  } catch (error) {
    console.error('Lỗi đăng ký:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi máy chủ'
    });
  }
};

export const logout = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (userId) {
      // Cập nhật lastActive khi logout
      await User.findByIdAndUpdate(userId, {
        lastActive: new Date()
      });

      // Xóa khỏi danh sách online users và broadcast
      const io = getIO();
      if (io && io.onlineUsers) {
        io.onlineUsers.delete(userId.toString());

        io.emit('userStatusChange', {
          userId: userId.toString(),
          status: 'offline'
        });
      }
    }

    res.clearCookie('token', {
      httpOnly: true,
      secure: true,
      sameSite: 'None',
      path: '/'
    });

    res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

export const checkAuth = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');

    // Cập nhật token để gia hạn nếu cần
    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    // Làm mới cookie
    const cookieOptions = {
      httpOnly: true,
      secure: true,
      sameSite: 'None',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/'
    };

    // Set cookie mới
    res.cookie('token', token, cookieOptions);

    res.status(200).json({
      success: true,
      user,
      token, // Thêm token để frontend lưu nếu cần
      cookieSet: true
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

const client = new OAuth2Client(process.env.GOOGLE_APP_ID);

// Xử lý đăng nhập/đăng ký bằng Google
export const googleAuth = async (req, res) => {
  try {
    const { tokenId } = req.body;

    if (!tokenId) {
      return res.status(400).json({
        success: false,
        message: 'Token không hợp lệ'
      });
    }

    // Xác thực token với Google
    const ticket = await client.verifyIdToken({
      idToken: tokenId,
      audience: process.env.GOOGLE_APP_ID
    });

    const { email_verified, name, email, picture, sub: googleId } = ticket.getPayload();

    // Kiểm tra email đã được xác thực chưa
    if (!email_verified) {
      return res.status(400).json({
        success: false,
        message: 'Email của bạn chưa được xác thực với Google'
      });
    }

    // Tìm kiếm user bằng googleId hoặc email
    let user = await User.findOne({ $or: [{ googleId }, { email }] });

    // Nếu user không tồn tại, tạo mới
    if (!user) {
      // Tạo username ngẫu nhiên dựa trên email
      const usernameBase = email.split('@')[0];
      let username = usernameBase;
      let counter = 1;

      // Kiểm tra username có tồn tại không
      let existingUsername = await User.findOne({ username });
      while (existingUsername) {
        username = `${usernameBase}${counter}`;
        counter++;
        existingUsername = await User.findOne({ username });
      }

      // Tạo password ngẫu nhiên
      const password = Math.random().toString(36).slice(-10) + Math.random().toString(36).slice(-10);

      user = new User({
        googleId,
        username,
        fullName: name,
        email,
        password, // Sẽ được hash tự động bởi pre-save middleware
        profilePicture: picture || undefined,
        authType: 'google'
      });

      await user.save();
    } else if (!user.googleId) {
      // Nếu user đã tồn tại nhưng chưa có googleId (đăng ký qua email)
      user.googleId = googleId;
      user.authType = 'google';
      if (!user.profilePicture || user.profilePicture === 'https://thumbs.dreamstime.com/b/default-avatar-profile-icon-vector-social-media-user-portrait-176256935.jpg') {
        user.profilePicture = picture;
      }
      await user.save();
    }

    // Tạo JWT token
    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    // Cài đặt cookie bảo mật
    const cookieOptions = {
      httpOnly: true,
      secure: true,
      sameSite: 'None',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 ngày
      path: '/'
    };

    // Set cookie cho trình duyệt
    res.cookie('token', token, cookieOptions);

    // Trả về thông tin người dùng và token
    res.status(200).json({
      success: true,
      message: 'Đăng nhập Google thành công',
      token,
      cookieSet: true,
      user: {
        id: user._id,
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        profilePicture: user.profilePicture,
        bio: user.bio,
        followers: user.followers,
        following: user.following,
        posts: user.posts,
        isPrivate: user.isPrivate,
        authType: user.authType,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    });
  } catch (error) {
    console.error('Lỗi xác thực Google:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi xác thực với Google'
    });
  }
};
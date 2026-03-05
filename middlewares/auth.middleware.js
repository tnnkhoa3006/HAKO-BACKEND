import jwt from 'jsonwebtoken';
import User from '../models/user.model.js';

export const verifyToken = async (req, res, next) => {
  try {
    let token = req.cookies.token;

    // Nếu không có token trong cookie, kiểm tra trong header Authorization
    if (!token && req.headers.authorization) {
      const authHeader = req.headers.authorization;
      if (authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }

    // Nếu không có token trong cookie hoặc header, kiểm tra trong query params
    // (Hữu ích cho các redirect từ OAuth và trường hợp iOS/macOS)
    if (!token && req.query.token) {
      token = req.query.token;

      // Nếu token đến từ query params, lưu vào cookie để sử dụng sau này
      if (token) {
        const cookieOptions = {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Lax',
          maxAge: 30 * 24 * 60 * 60 * 1000,
          path: '/'
        };
        res.cookie('token', token, cookieOptions);
      }
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Verify user still exists in database
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    res.clearCookie('token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Lax',
      path: '/'
    });

    return res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }
};

export const requireAdmin = (req, res, next) => {
  const role = req.user?.role || 'user';
  if (role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Chi quan tri vien moi duoc truy cap.',
    });
  }
  next();
};

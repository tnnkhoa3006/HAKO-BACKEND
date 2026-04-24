import mongoose from 'mongoose';
import { ensureHakoBotUser } from '../services/bot.service.js';

const syncAdminRoles = async () => {
  try {
    const User =
      mongoose.models.User || (await import('../models/user.model.js')).default;
    await User.updateMany({ role: { $exists: false } }, { $set: { role: 'user' } });

    const emails = (process.env.ADMIN_EMAILS || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const usernames = (process.env.ADMIN_USERNAMES || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (emails.length) {
      await User.updateMany(
        { email: { $in: emails } },
        { $set: { role: 'admin' } }
      );
    }

    if (usernames.length) {
      await User.updateMany(
        { username: { $in: usernames } },
        { $set: { role: 'admin' } }
      );
    }

    if (emails.length || usernames.length) {
      console.log('Da dong bo role admin theo ADMIN_EMAILS / ADMIN_USERNAMES');
    }
  } catch (e) {
    console.error('syncAdminRoles:', e);
  }
};

const syncSystemUsers = async () => {
  try {
    await ensureHakoBotUser();
  } catch (e) {
    console.error('syncSystemUsers:', e);
  }
};

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Ket noi MongoDB thanh cong');
    await syncAdminRoles();
    await syncSystemUsers();
  } catch (err) {
    console.error('Loi ket noi MongoDB:', err);
    process.exit(1);
  }
};

export default connectDB;

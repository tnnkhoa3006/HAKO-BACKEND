import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  fullName: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: function () { return !this.phoneNumber; },
    unique: true,
    sparse: true,
    trim: true,
    lowercase: true,
  },
  phoneNumber: {
    type: String,
    required: function () { return !this.email; },
    unique: true,
    sparse: true,
    trim: true,
  },
  password: {
    type: String,
    required: true,
    minlength: 6,
  },
  profilePicture: {
    type: String,
    default: 'https://thumbs.dreamstime.com/b/default-avatar-profile-icon-vector-social-media-user-portrait-176256935.jpg',
  },
  bio: {
    type: String,
    default: '',
  },
  followers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  following: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  isOnline: {
    type: Boolean,
    default: false,
  },
  posts: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post',
  }],
  isPrivate: {
    type: Boolean,
    default: false,
  },
  googleId: {
    type: String,
    unique: true,
    sparse: true,
  },
  checkMark: {
    type: Boolean,
    default: false,
  },
  authType: {
    type: String,
    enum: ['local', 'facebook', 'google'],
    default: 'local'
  },
  isOnline: {
    type: Boolean,
    default: false,
  },
  lastActive: {
    type: Date,
    default: Date.now
  },
  lastOnline: {
    type: Date,
    default: null
  },
  archivedStories: [{
    storyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Story'
    },
    media: String,
    mediaType: String,
    caption: String,
    createdAt: Date,
    viewCount: Number
  }],
}, { timestamps: true });

UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

UserSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Đăng ký model với tên 'User' (chữ hoa)
export default mongoose.model('User', UserSchema, 'users');
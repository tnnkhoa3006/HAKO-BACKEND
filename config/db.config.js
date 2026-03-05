import mongoose from 'mongoose';

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Kết nối MongoDB thành công');
  } catch (err) {
    console.error('Lỗi kết nối MongoDB:', err);
    process.exit(1);
  }
};

export default connectDB;

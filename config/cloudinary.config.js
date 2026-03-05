import dotenv from 'dotenv';
dotenv.config();

import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export function getCloudinaryMusic() {
  // Debug log biến môi trường
  console.log('MUSIC ENV:', {
    name: process.env.CLOUDINARY_MUSIC_NAME,
    key: process.env.CLOUDINARY_MUSIC_KEY,
    secret: process.env.CLOUDINARY_MUSIC_SECRET,
  });
  if (!process.env.CLOUDINARY_MUSIC_NAME || !process.env.CLOUDINARY_MUSIC_KEY || !process.env.CLOUDINARY_MUSIC_SECRET) {
    throw new Error('Thiếu biến môi trường Cloudinary music.');
  }
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_MUSIC_NAME,
    api_key: process.env.CLOUDINARY_MUSIC_KEY,
    api_secret: process.env.CLOUDINARY_MUSIC_SECRET,
  });
  return cloudinary;
}

export default cloudinary;
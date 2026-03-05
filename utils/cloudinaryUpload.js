import cloudinary from '../config/cloudinary.config.js';
import fs from 'fs';

// Upload hình ảnh
export const uploadImage = async (filePath, folder = 'images') => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder,
      resource_type: 'image', // Loại là ảnh
    });
    fs.unlinkSync(filePath); // Xóa file tạm sau khi upload thành công
    return result;
  } catch (err) {
    // Đảm bảo xóa file tạm nếu có lỗi xảy ra
    fs.existsSync(filePath) && fs.unlinkSync(filePath);
    throw err;
  }
};

// Upload video
export const uploadVideo = async (filePath, folder = 'videos') => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder,
      resource_type: 'video', // Loại là video
    });
    fs.unlinkSync(filePath); // Xóa file tạm sau khi upload thành công
    return result;
  } catch (err) {
    // Đảm bảo xóa file tạm nếu có lỗi xảy ra
    fs.existsSync(filePath) && fs.unlinkSync(filePath);
    throw err;
  }
};

// Upload audio
export const uploadAudio = async (filePath, folder = 'audios') => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder,
      resource_type: 'video', // Cloudinary sử dụng 'video' cho audio files
    });
    fs.unlinkSync(filePath); // Xóa file tạm sau khi upload thành công
    return result;
  } catch (err) {
    // Đảm bảo xóa file tạm nếu có lỗi xảy ra
    fs.existsSync(filePath) && fs.unlinkSync(filePath);
    throw err;
  }
};

// Upload nhiều file cùng lúc (cho story với media + audio)
export const uploadMultipleFiles = async (files, folders = {}) => {
  const results = {};

  try {
    for (const [fieldName, file] of Object.entries(files)) {
      const folder = folders[fieldName] || fieldName;

      if (file.mimetype.startsWith('image/')) {
        results[fieldName] = await uploadImage(file.path, folder);
      } else if (file.mimetype.startsWith('video/')) {
        results[fieldName] = await uploadVideo(file.path, folder);
      } else if (file.mimetype.startsWith('audio/')) {
        results[fieldName] = await uploadAudio(file.path, folder);
      }
    }

    return results;
  } catch (err) {
    // Cleanup remaining files if error occurs
    for (const file of Object.values(files)) {
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
    }
    throw err;
  }
};
import { generateRandomUser, FAKE_USERS } from './buffAdmin.js';

// Một số caption tiếng Việt tự nhiên
const captions = [
  'Một ngày đẹp trời để đăng ảnh!',
  'Chill cùng bạn bè cuối tuần.',
  'Cà phê sáng và nắng nhẹ.',
  'Đi đâu cũng được, miễn là cùng nhau.',
  'Thích cảm giác bình yên như thế này.',
  'Cuộc sống là những chuyến đi.',
  'Hôm nay trời nhẹ lên cao.',
  'Mỗi ngày là một niềm vui mới.',
  'Thử thách bản thân với điều mới.',
  'Chỉ cần mỉm cười, mọi chuyện sẽ ổn.',
];

// Danh sách ảnh dự phòng
const fallbackImages = [
  'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1465101046530-73398c7f28ca?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1519125323398-675f0ddb6308?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1519985176271-adb1088fa94c?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=800&q=80',
  'https://images.pexels.com/photos/1130626/pexels-photo-1130626.jpeg?auto=compress&w=800&q=80',
  'https://images.pexels.com/photos/210186/pexels-photo-210186.jpeg?auto=compress&w=800&q=80',
  'https://images.pexels.com/photos/34950/pexels-photo.jpg?auto=compress&w=800&q=80',
  'https://images.pexels.com/photos/247917/pexels-photo-247917.jpeg?auto=compress&w=800&q=80',
  'https://images.pexels.com/photos/355465/pexels-photo-355465.jpeg?auto=compress&w=800&q=80',
];

// Hàm lấy ảnh từ Lorem Picsum (không cần API key, không giới hạn rate)
function fetchPicsumImages(count = 10) {
  // Tạo danh sách URL ảnh random từ picsum.photos
  const images = [];
  for (let i = 0; i < count; i++) {
    // Sử dụng seed để tránh trùng lặp
    images.push(`https://picsum.photos/seed/buffuser_${Date.now()}_${i}/800/600`);
  }
  return images;
}

// Hàm lấy ảnh từ nhiều nguồn, chỉ dùng fallback và picsum
async function fetchMultiSourceImages(count = 50) {
  // Lấy thêm từ Lorem Picsum (không cần API key, không bị rate limit)
  const picsum = fetchPicsumImages(count);
  // Gộp và lọc trùng
  const all = [...picsum, ...fallbackImages];
  // Lọc trùng URL
  const unique = Array.from(new Set(all.filter(Boolean)));
  // Trả về đúng số lượng cần
  return unique.slice(0, count);
}

// Global image pool để dùng chung nhiều nơi
let globalImagePool = [];
const IMAGE_POOL_SIZE = 200;

// Hàm khởi tạo hoặc bổ sung pool ảnh toàn cục từ nhiều nguồn
export async function ensureImagePool(size = IMAGE_POOL_SIZE) {
  if (globalImagePool.length < size) {
    const need = size - globalImagePool.length;
    const newImages = await fetchMultiSourceImages(need);
    // Tránh trùng lặp
    globalImagePool = Array.from(new Set([...globalImagePool, ...newImages]));
  }
  return globalImagePool;
}

// Sinh danh sách bài viết ảo chân thật, random từ pool ảnh toàn cục
export async function generateBuffUserPostsHome(count = 10) {
  // Lấy user từ FAKE_USERS cố định, không random lại
  const users = FAKE_USERS.slice(0, count);
  // Đảm bảo pool ảnh đủ lớn
  const imagePool = await ensureImagePool(IMAGE_POOL_SIZE);
  // Shuffle pool để lấy ảnh không trùng nếu đủ
  let shuffledImages = [...imagePool];
  for (let i = shuffledImages.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledImages[i], shuffledImages[j]] = [shuffledImages[j], shuffledImages[i]];
  }
  const posts = users.map((user, idx) => {
    let fileUrl;
    if (idx < shuffledImages.length) {
      fileUrl = shuffledImages[idx]; // Không trùng nếu đủ ảnh
    } else {
      // Nếu thiếu thì random lại từ pool (có thể trùng)
      fileUrl = imagePool[Math.floor(Math.random() * imagePool.length)] || '';
    }

    // Random số like, comment, reply nhỏ để chân thật
    const likes = Math.floor(Math.random() * 250) + 5; // 5-254
    const commentCount = Math.floor(Math.random() * 30); // 0-29
    const replyCount = Math.floor(Math.random() * 8); // 0-7
    const createdAt = new Date(Date.now() - Math.random() * 86400000 * 15); // 15 ngày gần nhất
    const caption = captions[Math.floor(Math.random() * captions.length)];

    return {
      _id: `buff_post_${user._id}_${idx}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      caption,
      desc: '',
      fileUrl,
      type: 'image',
      author: {
        _id: user._id,
        username: user.username,
        fullName: user.fullName,
        profilePicture: user.profilePicture,
        checkMark: user.isVerified || false,
        isFake: true,
        // Bổ sung các trường khác nếu FE cần hiển thị
      },
      likes,
      totalLikes: likes,
      commentCount,
      replyCount,
      totalComments: commentCount + replyCount,
      isBuffed: true,
      engagement: {
        likes,
        comments: commentCount + replyCount,
        total: likes + commentCount + replyCount
      },
      isLike: false,
      hasStories: false,
      createdAt,
      isFake: true
    };
  });
  return posts;
}

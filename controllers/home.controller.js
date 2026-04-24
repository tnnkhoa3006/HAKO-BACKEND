import Post from '../models/post.model.js';
import Comment from '../models/comment.model.js';
import User from '../models/user.model.js';
import Story from '../models/story.model.js';
import mongoose from 'mongoose';
import { archiveExpiredStories } from '../helper/ScanStory.js';
import { generateRandomUser } from '../helper/buffAdmin.js';
import { generateBuffUserPostsHome } from '../helper/buffUserPostHome.js';
import Interaction from '../models/interaction.model.js';

// ====== HELPER: Pseudo-random shuffle dựa trên user seed ======
const getUserSeed = (userId) => {
  const str = userId.toString();
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash = hash & hash;
  }
  return Math.abs(hash);
};

const seededShuffle = (array, seed) => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const pseudoRandom = Math.sin(seed + i) * 10000;
    const j = Math.floor((pseudoRandom - Math.floor(pseudoRandom)) * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};
// ====== END HELPER ======

// ====== HELPER: Đếm comment/reply cho nhiều bài viết bằng 1 aggregate (fix N+1) ======
const getCommentCountsForPosts = async (postIds) => {
  if (!postIds || postIds.length === 0) return new Map();

  const results = await Comment.aggregate([
    { $match: { post: { $in: postIds } } },
    {
      $group: {
        _id: { post: '$post', isReply: { $cond: [{ $ne: ['$parentId', null] }, true, false] } },
        count: { $sum: 1 }
      }
    }
  ]);

  // Map postId -> { commentCount, replyCount }
  const countMap = new Map();
  for (const r of results) {
    const pid = r._id.post.toString();
    if (!countMap.has(pid)) countMap.set(pid, { commentCount: 0, replyCount: 0 });
    if (r._id.isReply) {
      countMap.get(pid).replyCount = r.count;
    } else {
      countMap.get(pid).commentCount = r.count;
    }
  }
  return countMap;
};
// ====== END HELPER ======

// ====== HELPER: Tính điểm time decay theo kiểu Facebook ======
// Bài càng mới càng điểm cao, giảm dần theo giờ
const getRecencyScore = (createdAt) => {
  const ageInHours = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60);
  // Decay exponential: điểm giảm 50% mỗi 24 giờ
  return Math.pow(0.97, ageInHours);
};
// ====== END HELPER ======

// ====== HELPER: Format post với likes/comments/isLike/engagement/hasStories ======
const formatPost = (post, loggedInUserId, countMap, usersWithStoriesSet) => {
  const likesArr = Array.isArray(post.likes) ? post.likes.map(id => id?.toString()) : [];
  const isLike = loggedInUserId ? likesArr.includes(loggedInUserId.toString()) : false;

  const pid = post._id.toString();
  const counts = countMap.get(pid) || { commentCount: 0, replyCount: 0 };

  // Bài của khoatnn_6: buff số liệu
  if (post.author?.username === 'khoatnn_6') {
    const buffedLikes = typeof post.buffedLikes === 'number' ? post.buffedLikes : 200000 + Math.floor(Math.random() * 300000);
    const buffedCommentCount = typeof post.buffedCommentCount === 'number' ? post.buffedCommentCount : Math.floor(Math.random() * 100000) + 200000;
    const buffedReplyCount = typeof post.buffedReplyCount === 'number' ? post.buffedReplyCount : Math.floor(Math.random() * 50000) + 100000;
    const totalLikes = buffedLikes + likesArr.length;
    const totalComments = buffedCommentCount + buffedReplyCount;

    return {
      ...post,
      likes: totalLikes,
      realLikes: likesArr.length,
      isBuffed: true,
      buffedLikes,
      commentCount: buffedCommentCount,
      replyCount: buffedReplyCount,
      totalComments,
      totalLikes,
      engagement: { likes: totalLikes, comments: totalComments, total: totalLikes + totalComments },
      isLike,
      hasStories: usersWithStoriesSet.has(post.author._id.toString())
    };
  }

  // Bài thường
  const totalLikes = likesArr.length;
  const totalComments = counts.commentCount + counts.replyCount;
  return {
    ...post,
    likes: totalLikes,
    totalLikes,
    isBuffed: false,
    commentCount: counts.commentCount,
    replyCount: counts.replyCount,
    totalComments,
    engagement: { likes: totalLikes, comments: totalComments, total: totalLikes + totalComments },
    isLike,
    hasStories: post.author ? usersWithStoriesSet.has(post.author._id.toString()) : false
  };
};
// ====== END HELPER ======

// ====== HELPER: Lưu buffedLikes/Comments vào DB nếu chưa có (batch) ======
const ensureBuffedMetrics = async (posts) => {
  const updates = [];
  for (const post of posts) {
    if (post.author?.username !== 'khoatnn_6') continue;
    const updateObj = {};
    if (typeof post.buffedLikes !== 'number') {
      post.buffedLikes = 200000 + Math.floor(Math.random() * 300000);
      updateObj.buffedLikes = post.buffedLikes;
    }
    if (typeof post.buffedCommentCount !== 'number') {
      post.buffedCommentCount = Math.floor(Math.random() * 100000) + 200000;
      updateObj.buffedCommentCount = post.buffedCommentCount;
    }
    if (typeof post.buffedReplyCount !== 'number') {
      post.buffedReplyCount = Math.floor(Math.random() * 50000) + 100000;
      updateObj.buffedReplyCount = post.buffedReplyCount;
    }
    if (Object.keys(updateObj).length > 0) {
      updates.push(Post.findByIdAndUpdate(post._id, updateObj));
    }
  }
  if (updates.length > 0) await Promise.all(updates);
};
// ====== END HELPER ======


// ============================================================
//  getPostHome — Feed cơ bản (fallback khi chưa có interaction)
//  Ưu tiên: khoatnn_6 → người đang follow → shuffle với bài lạ
// ============================================================
export const getPostHome = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const loggedInUserId = req.user?.id;

    // 1. Lấy danh sách following của user đang đăng nhập
    let followingIds = [];
    if (loggedInUserId) {
      const currentUser = await User.findById(loggedInUserId).select('following').lean();
      followingIds = currentUser?.following?.map(id => id.toString()) || [];
    }

    // 2. Lấy bài của user đang theo dõi (ưu tiên 1)
    const followingObjectIds = followingIds.map(id => new mongoose.Types.ObjectId(id));
    const prioritizedAuthorIds = loggedInUserId
      ? [...followingObjectIds, new mongoose.Types.ObjectId(loggedInUserId)]
      : followingObjectIds;
    const followingPosts = await Post.find(
      prioritizedAuthorIds.length > 0 ? { author: { $in: prioritizedAuthorIds } } : {}
    )
      .populate('author', 'username profilePicture fullName checkMark')
      .sort({ createdAt: -1 })
      .lean();

    // 3. Lấy bài của người chưa follow (ưu tiên sau)
    const otherPosts = await Post.find(
      followingIds.length > 0
        ? { author: { $nin: [...followingObjectIds, new mongoose.Types.ObjectId(loggedInUserId)] } }
        : {}
    )
      .populate('author', 'username profilePicture fullName checkMark')
      .sort({ createdAt: -1 })
      .lean();

    // 4. Gộp và loại trùng
    const allRealPosts = [...followingPosts, ...otherPosts];
    const seenIds = new Set();
    const dedupedPosts = allRealPosts.filter(p => {
      const id = p._id.toString();
      if (seenIds.has(id)) return false;
      seenIds.add(id);
      return true;
    });

    // 5. Đảm bảo số liệu buff cho khoatnn_6
    await ensureBuffedMetrics(dedupedPosts);

    // 6. Lấy users có story + đếm comment một lần (fix N+1)
    const now = new Date();
    const usersWithStories = await Story.distinct('author', { isArchived: false, expiresAt: { $gt: now } });
    const usersWithStoriesSet = new Set(usersWithStories.map(id => id.toString()));

    const realPostIds = dedupedPosts.map(p => p._id);
    const countMap = await getCommentCountsForPosts(realPostIds);

    // 7. Format posts
    const processedPosts = dedupedPosts.map(post =>
      formatPost(post, loggedInUserId, countMap, usersWithStoriesSet)
    );

    // 8. Bài ảo (fake posts)
    if (!global._FAKE_USERS) {
      global._FAKE_USERS = Array.from({ length: 100 }, (_, i) => generateRandomUser(i));
    }
    if (!global._FAKE_POSTS) {
      global._FAKE_POSTS = await generateBuffUserPostsHome(100);
    }
    const fakePosts = global._FAKE_POSTS;

    // 9. Phân loại: khoatnn_6 → following → others (shuffle) → fake (shuffle)
    const vanlocPosts = processedPosts.filter(p => p.author?.username === 'khoatnn_6')
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const followingProcessed = processedPosts.filter(
      p => p.author?.username !== 'khoatnn_6' && followingIds.includes(p.author?._id?.toString())
    );
    const otherProcessed = processedPosts.filter(
      p => p.author?.username !== 'khoatnn_6' && !followingIds.includes(p.author?._id?.toString())
    );

    const userSeed = loggedInUserId ? getUserSeed(loggedInUserId) : Math.floor(Math.random() * 100000);

    // Shuffle others + fake để đa dạng, nhưng giữ following theo thứ tự thời gian
    const shuffledOthers = seededShuffle([...otherProcessed, ...fakePosts], userSeed);

    // Kết hợp cuối: khoatnn_6 → following (thời gian) → shuffled (others + fake)
    const allPosts = [...vanlocPosts, ...followingProcessed, ...shuffledOthers];

    // 10. Phân trang
    const totalPosts = allPosts.length;
    const startIndex = (page - 1) * limit;
    const paginatedPosts = allPosts.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < totalPosts;

    return res.status(200).json({
      success: true,
      posts: paginatedPosts,
      total: totalPosts,
      page,
      limit,
      hasMore,
      totalPages: Math.ceil(totalPosts / limit)
    });
  } catch (error) {
    console.error('Lỗi khi lấy bài viết trang chủ:', error);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
  }
};


// ============================================================
//  getRecommendedPosts — Feed thông minh (Facebook-like)
//  Ưu tiên: khoatnn_6 → following + tương tác + AI topic + time decay
//  Có phân trang đầy đủ
// ============================================================
export const getRecommendedPosts = async (req, res) => {
  try {
    const loggedInUserId = req.user?.id;
    if (!loggedInUserId) {
      return res.status(401).json({ success: false, message: 'Không tìm thấy thông tin người dùng đăng nhập' });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const userObjectId = new mongoose.Types.ObjectId(loggedInUserId); // FIX: dùng đúng ObjectId

    // 1. Lấy danh sách following
    const currentUser = await User.findById(loggedInUserId).select('following').lean();
    const followingIds = currentUser?.following?.map(id => id.toString()) || [];
    const followingObjectIds = followingIds.map(id => new mongoose.Types.ObjectId(id));

    // 2. Lấy tương tác mạnh nhất (FIX: dùng userObjectId đúng)
    const topInteractions = await Interaction.aggregate([
      {
        $match: {
          user: userObjectId,  // ← ĐÃ FIX
          type: { $in: ['like', 'comment', 'follow'] }
        }
      },
      {
        $group: {
          _id: '$targetUser',
          totalWeight: { $sum: '$weight' },
          lastInteractionAt: { $max: '$lastInteractionAt' }
        }
      },
      { $sort: { totalWeight: -1, lastInteractionAt: -1 } },
      { $limit: 30 }
    ]);

    // Nếu chưa có interaction → fallback về getPostHome
    if (!topInteractions || topInteractions.length === 0) {
      return getPostHome(req, res);
    }

    const interactedAuthorIds = topInteractions.map(i => i._id.toString());
    const weightByAuthor = new Map(topInteractions.map(i => [i._id.toString(), i.totalWeight]));

    // 3. Lấy các topic AI mà user hay tương tác
    const postInteractions = await Interaction.find({
      user: loggedInUserId,
      type: { $in: ['like', 'comment'] },
      targetPost: { $ne: null }
    }).select('targetPost weight').lean();

    const postIds = postInteractions.map(pi => pi.targetPost);
    const interactedPosts = postIds.length
      ? await Post.find({ _id: { $in: postIds } }).select('aiTopics').lean()
      : [];

    const topicScoreMap = new Map();
    interactedPosts.forEach(p => {
      if (!Array.isArray(p.aiTopics)) return;
      const weight = postInteractions.find(pi => String(pi.targetPost) === String(p._id))?.weight || 1;
      p.aiTopics.forEach(t => {
        const key = String(t).toLowerCase();
        topicScoreMap.set(key, (topicScoreMap.get(key) || 0) + weight);
      });
    });

    const preferredTopics = Array.from(topicScoreMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([topic]) => topic);

    // 4. Thu thập bài viết từ nhiều nguồn
    const allAuthorIds = [...new Set([...interactedAuthorIds, ...followingIds, loggedInUserId])];
    const allAuthorObjectIds = allAuthorIds.map(id => new mongoose.Types.ObjectId(id));

    const [followingAndInteractedPosts, topicMatchedPosts, discoverPosts] = await Promise.all([
      // Nguồn 1: bài từ người follow + người tương tác nhiều
      Post.find({ author: { $in: allAuthorObjectIds } })
        .populate('author', 'username profilePicture fullName checkMark')
        .sort({ createdAt: -1 })
        .lean(),

      // Nguồn 2: bài từ chủ đề AI phù hợp (người chưa follow)
      preferredTopics.length > 0
        ? Post.find({
            aiTopics: { $in: preferredTopics },
            author: { $nin: [...allAuthorObjectIds, userObjectId] }
          })
          .populate('author', 'username profilePicture fullName checkMark')
          .sort({ createdAt: -1 })
          .limit(limit * 2)
          .lean()
        : [],

      // Nguồn 3: bài mới nhất từ người chưa quen (khám phá)
      Post.find({ author: { $nin: [...allAuthorObjectIds, userObjectId] } })
        .populate('author', 'username profilePicture fullName checkMark')
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean()
    ]);

    // 5. Gộp và loại trùng (FIX dedup)
    const seenPostIds = new Set();
    const uniquePosts = [];
    for (const post of [...followingAndInteractedPosts, ...topicMatchedPosts, ...discoverPosts]) {
      const id = post._id.toString();
      if (!seenPostIds.has(id)) {
        seenPostIds.add(id);
        uniquePosts.push(post);
      }
    }

    // 6. Đảm bảo buff metrics cho khoatnn_6
    await ensureBuffedMetrics(uniquePosts);

    // 7. Đếm comment một lần (fix N+1)
    const now = new Date();
    const usersWithStories = await Story.distinct('author', { isArchived: false, expiresAt: { $gt: now } });
    const usersWithStoriesSet = new Set(usersWithStories.map(id => id.toString()));

    const uniquePostIds = uniquePosts.map(p => p._id);
    const countMap = await getCommentCountsForPosts(uniquePostIds);

    // 8. Format posts
    const processedPosts = uniquePosts.map(post =>
      formatPost(post, loggedInUserId, countMap, usersWithStoriesSet)
    );

    // 9. Tính điểm Facebook-style: interaction weight + topic match + time decay
    const scoredPosts = processedPosts.map(post => {
      const authorId = post.author?._id?.toString();

      // Điểm tương tác với tác giả
      const interactionWeight = weightByAuthor.get(authorId) || 0;

      // Điểm following bonus
      const followingBonus = followingIds.includes(authorId) ? 5 : 0;

      // Điểm trùng chủ đề AI
      const postTopics = Array.isArray(post.aiTopics)
        ? post.aiTopics.map(t => String(t).toLowerCase())
        : [];
      const topicScore = postTopics.filter(t => preferredTopics.includes(t)).length;

      // Điểm time decay (FIX: bài mới hơn ưu tiên hơn)
      const recencyScore = getRecencyScore(post.createdAt) * 10;

      // Điểm engagement (likes + comments)
      const engagementScore = Math.log1p((post.totalLikes || 0) + (post.totalComments || 0)) * 0.5;

      // Tổng điểm (giống Facebook scoring):
      // interaction (quen biết) > following > topic (sở thích) > thời gian > engagement
      const totalScore = interactionWeight * 3 + followingBonus * 2 + topicScore * 1.5 + recencyScore + engagementScore;

      return { ...post, _score: totalScore };
    });

    // 10. Ưu tiên khoatnn_6 luôn ở đầu, sort phần còn lại theo score
    const vanlocPosts = scoredPosts
      .filter(p => p.author?.username === 'khoatnn_6')
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const otherScoredPosts = scoredPosts
      .filter(p => p.author?.username !== 'khoatnn_6')
      .sort((a, b) => b._score - a._score);

    const allSorted = [...vanlocPosts, ...otherScoredPosts];

    // 11. Phân trang (FIX: thêm pagination cho getRecommendedPosts)
    const totalPosts = allSorted.length;
    const startIndex = (page - 1) * limit;
    const paginatedPosts = allSorted.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < totalPosts;

    return res.status(200).json({
      success: true,
      posts: paginatedPosts,
      total: totalPosts,
      page,
      limit,
      hasMore,
      totalPages: Math.ceil(totalPosts / limit),
      isRecommendation: true
    });
  } catch (error) {
    console.error('Lỗi khi lấy bài viết gợi ý:', error);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy bài viết gợi ý' });
  }
};


// ============================================================
//  suggestUsers — Gợi ý người dùng (giữ nguyên)
// ============================================================
export const suggestUsers = async (req, res) => {
  try {
    const myId = req.user.id;
    const limit = parseInt(req.query.limit) || 10;

    const currentUser = await User.findById(myId).select('following').lean();
    const followingIds = currentUser ? currentUser.following.map(id => id.toString()) : [];

    let users = await User.find({
      _id: { $ne: myId, $nin: followingIds }
    })
      .select('-password -email -phoneNumber -followers -following -posts')
      .limit(limit)
      .lean();

    users = users.map(u => {
      if (u.username === 'khoatnn_6') {
        return { ...u, checkMark: true, followersCount: 1000000, isBuffed: true };
      }
      return { ...u, checkMark: !!u.checkMark, followersCount: 0, isBuffed: false };
    });

    users.sort((a, b) => {
      if (a.username === 'khoatnn_6') return -1;
      if (b.username === 'khoatnn_6') return 1;
      if (b.checkMark && !a.checkMark) return 1;
      if (!b.checkMark && a.checkMark) return -1;
      return a.username < b.username ? -1 : a.username > b.username ? 1 : 0;
    });

    return res.status(200).json({ success: true, users });
  } catch (error) {
    console.error('Lỗi khi gợi ý người dùng:', error);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi gợi ý người dùng' });
  }
};


// ============================================================
//  getStoryHome — Lấy stories trang chủ (giữ nguyên)
// ============================================================
export const getStoryHome = async (req, res) => {
  try {
    const myId = req.user.id;
    const { userId } = req.query;

    await archiveExpiredStories();

    let storyCondition = {
      isArchived: false,
      expiresAt: { $gt: new Date() }
    };

    const vanlocUser = await User.findOne({ username: 'khoatnn_6' }).lean();
    if (vanlocUser) {
      if (!userId) {
        const vanlocStories = await Story.find({ author: vanlocUser._id, isArchived: false })
          .select('_id author')
          .populate('author', 'username profilePicture checkMark')
          .sort({ createdAt: -1 })
          .lean();

        storyCondition.author = { $ne: vanlocUser._id };
        const stories = await Story.find(storyCondition)
          .select('_id author')
          .populate('author', 'username profilePicture checkMark')
          .sort({ createdAt: -1 })
          .lean();

        const allStories = [...vanlocStories, ...stories];
        const myStories = allStories.filter(s => s.author._id.toString() === myId.toString());
        const otherStories = allStories.filter(s => s.author._id.toString() !== myId.toString());
        const sortedStories = [...myStories, ...otherStories];

        return res.status(200).json({
          success: true,
          stories: sortedStories.map(s => ({ _id: s._id, author: s.author })),
          isSpecificUser: false
        });
      } else if (userId.toString() === vanlocUser._id.toString()) {
        const vanlocStories = await Story.find({ author: vanlocUser._id, isArchived: false })
          .select('_id author')
          .populate('author', 'username profilePicture checkMark')
          .sort({ createdAt: -1 })
          .lean();

        return res.status(200).json({
          success: true,
          stories: vanlocStories.map(s => ({ _id: s._id, author: s.author })),
          isSpecificUser: true
        });
      }
    }

    const stories = await Story.find(storyCondition)
      .select('_id author')
      .populate('author', 'username profilePicture checkMark')
      .sort({ createdAt: -1 })
      .lean();

    const myStories = stories.filter(s => s.author._id.toString() === myId.toString());
    const otherStories = stories.filter(s => s.author._id.toString() !== myId.toString());
    const sortedStories = [...myStories, ...otherStories];

    return res.status(200).json({
      success: true,
      stories: sortedStories.map(s => ({ _id: s._id, author: s.author })),
      isSpecificUser: !!userId
    });
  } catch (error) {
    console.error('Lỗi khi lấy stories:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server khi lấy stories' });
  }
};

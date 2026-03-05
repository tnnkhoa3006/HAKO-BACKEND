import Post from '../models/post.model.js';
import Comment from '../models/comment.model.js';
import User from '../models/user.model.js';
import Story from '../models/story.model.js';
import { archiveExpiredStories } from '../helper/ScanStory.js';
import { generateRandomUser } from '../helper/buffAdmin.js';
import { generateBuffUserPostsHome } from '../helper/buffUserPostHome.js';
import Interaction from '../models/interaction.model.js';

export const getPostHome = async (req, res) => {
  try {
    // Lấy page và limit từ query, mặc định page=1, limit=10
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Lấy toàn bộ bài thật
    let posts = await Post.find()
      .populate('author', 'username profilePicture fullName checkMark')
      .sort({ createdAt: -1 })
      .lean();

    const loggedInUserId = req.user?.id;

    // Lấy danh sách userId có story còn hạn
    const now = new Date();
    const usersWithStories = await Story.distinct('author', {
      isArchived: false,
      expiresAt: { $gt: now }
    });
    const usersWithStoriesSet = new Set(usersWithStories.map(id => id.toString()));

    // Xử lý bài viết thật (giữ nguyên logic cũ của bạn)
    const processedPosts = await Promise.all(posts.map(async post => {
      const likesArr = Array.isArray(post.likes) ? post.likes.map(id => id?.toString()) : [];
      let isLike = false;
      if (loggedInUserId && likesArr.length > 0) {
        isLike = likesArr.includes(loggedInUserId.toString());
      }
      if (post.author.username === 'khoatnn_6') {
        let buffedLikes = post.buffedLikes;
        if (typeof buffedLikes !== 'number') {
          buffedLikes = 200000 + Math.floor(Math.random() * 300000);
          await Post.findByIdAndUpdate(post._id, { buffedLikes });
        }
        let buffedCommentCount = post.buffedCommentCount;
        let buffedReplyCount = post.buffedReplyCount;
        let updateObj = {};
        if (typeof buffedCommentCount !== 'number') {
          buffedCommentCount = Math.floor(Math.random() * 100000) + 200000;
          updateObj.buffedCommentCount = buffedCommentCount;
        }
        if (typeof buffedReplyCount !== 'number') {
          buffedReplyCount = Math.floor(Math.random() * 50000) + 100000;
          updateObj.buffedReplyCount = buffedReplyCount;
        }
        if (Object.keys(updateObj).length > 0) {
          await Post.findByIdAndUpdate(post._id, updateObj);
        }
        const totalLikes = (buffedLikes || 0) + likesArr.length;
        const totalComments = (buffedCommentCount || 0) + (buffedReplyCount || 0);
        return {
          ...post,
          likes: totalLikes,
          realLikes: likesArr.length,
          isBuffed: true,
          buffedLikes: buffedLikes,
          commentCount: buffedCommentCount,
          replyCount: buffedReplyCount,
          totalComments: totalComments,
          totalLikes: totalLikes,
          engagement: {
            likes: totalLikes,
            comments: totalComments,
            total: totalLikes + totalComments
          },
          isLike: isLike,
          hasStories: usersWithStoriesSet.has(post.author._id.toString())
        };
      }
      const commentCount = await Comment.countDocuments({
        post: post._id,
        parentId: null
      });
      const replyCount = await Comment.countDocuments({
        post: post._id,
        parentId: { $ne: null }
      });
      return {
        ...post,
        commentCount,
        replyCount,
        totalComments: commentCount + replyCount,
        likes: post.likes?.length || 0,
        totalLikes: post.likes?.length || 0,
        isBuffed: false,
        engagement: {
          likes: post.likes?.length || 0,
          comments: commentCount + replyCount,
          total: (post.likes?.length || 0) + commentCount + replyCount
        },
        isLike: isLike,
        hasStories: usersWithStoriesSet.has(post.author._id.toString())
      };
    }));

    // ====== TẠO BÀI VIẾT ẢO - FIX DUPLICATE KEYS ======
    if (!global._FAKE_USERS) {
      global._FAKE_USERS = Array.from({ length: 100 }, (_, i) => generateRandomUser(i));
    }
    // Không random lại nữa, chỉ tạo 1 lần duy nhất
    const fakeUsers = global._FAKE_USERS;
    // Sử dụng hàm generateBuffUserPostsHome mới để tạo fakePosts động với ảnh từ Unsplash
    if (!global._FAKE_POSTS) {
      global._FAKE_POSTS = await generateBuffUserPostsHome(100);
    }
    const fakePosts = global._FAKE_POSTS;

    // ====== ƯU TIÊN: khoatnn_6 > user thật > user ảo ======
    // 1. Ưu tiên bài của khoatnn_6 lên đầu
    const vanlocPosts = processedPosts.filter(p => p.author?.username === 'khoatnn_6');
    // 2. Các bài user thật còn lại
    const realPosts = processedPosts.filter(p => p.author?.username !== 'khoatnn_6');
    // 3. Bài ảo
    let allPosts = [...vanlocPosts, ...realPosts, ...fakePosts];

    // 4. Sắp xếp: tất cả bài của khoatnn_6 lên đầu (theo thời gian mới nhất), sau đó user thật (theo thời gian mới nhất), cuối cùng là ảo (theo thời gian mới nhất)
    allPosts.sort((a, b) => {
      const isVanlocA = a.author?.username === 'khoatnn_6';
      const isVanlocB = b.author?.username === 'khoatnn_6';
      if (isVanlocA && !isVanlocB) return -1;
      if (!isVanlocA && isVanlocB) return 1;
      // Nếu cùng là khoatnn_6 hoặc cùng không phải, sort theo thời gian mới nhất
      if (!a.isFake && b.isFake) return -1;
      if (a.isFake && !b.isFake) return 1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    // ====== ÁP DỤNG PHÂN TRANG ======
    const totalPosts = allPosts.length;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedPosts = allPosts.slice(startIndex, endIndex);
    const hasMore = endIndex < totalPosts;

    res.status(200).json({
      success: true,
      posts: paginatedPosts,
      total: totalPosts,
      page: page,
      limit: limit,
      hasMore: hasMore,
      totalPages: Math.ceil(totalPosts / limit)
    });
  } catch (error) {
    console.error('Lỗi khi lấy bài viết trang chủ:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
  }
};

// Gợi ý bài viết dựa trên lịch sử tương tác (like/comment/follow)
export const getRecommendedPosts = async (req, res) => {
  try {
    const loggedInUserId = req.user?.id;
    if (!loggedInUserId) {
      return res.status(401).json({
        success: false,
        message: 'Không tìm thấy thông tin người dùng đăng nhập'
      });
    }

    const limit = parseInt(req.query.limit) || 10;

    // 1. Lấy danh sách user mà current user tương tác nhiều nhất
    const topInteractions = await Interaction.aggregate([
      {
        $match: {
          user: new User({ _id: loggedInUserId })._id,
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
      {
        $sort: {
          totalWeight: -1,
          lastInteractionAt: -1
        }
      },
      {
        $limit: 20
      }
    ]);

    // Nếu chưa có dữ liệu tương tác, fallback dùng getPostHome logic hiện tại
    if (!topInteractions || topInteractions.length === 0) {
      return getPostHome(req, res);
    }

    const preferredAuthorIds = topInteractions.map((i) => i._id);

    // 1b. Lấy các chủ đề mà user hay tương tác (dựa trên like/comment bài viết có aiTopics)
    const postInteractions = await Interaction.find({
      user: loggedInUserId,
      type: { $in: ['like', 'comment'] },
      targetPost: { $ne: null }
    })
      .select('targetPost weight')
      .lean();

    const postIds = postInteractions.map((pi) => pi.targetPost);
    const interactedPosts = postIds.length
      ? await Post.find({ _id: { $in: postIds } })
          .select('aiTopics')
          .lean()
      : [];

    const topicScoreMap = new Map(); // topic -> score
    interactedPosts.forEach((p) => {
      if (!Array.isArray(p.aiTopics)) return;
      const weight =
        postInteractions.find((pi) => String(pi.targetPost) === String(p._id))
          ?.weight || 1;
      p.aiTopics.forEach((t) => {
        const key = String(t).toLowerCase();
        topicScoreMap.set(key, (topicScoreMap.get(key) || 0) + weight);
      });
    });

    const preferredTopics = Array.from(topicScoreMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([topic]) => topic);

    // 2. Lấy bài viết của các user được ưu tiên
    let posts = await Post.find({
      author: { $in: preferredAuthorIds }
    })
      .populate('author', 'username profilePicture fullName checkMark')
      .sort({ createdAt: -1 })
      .lean();

    // Nếu số bài còn ít, bổ sung thêm bài hot từ các user khác (fallback nhẹ)
    if (posts.length < limit) {
      const extraPosts = await Post.find({
        author: { $nin: preferredAuthorIds }
      })
        .populate('author', 'username profilePicture fullName checkMark')
        .sort({ createdAt: -1 })
        .limit(limit - posts.length)
        .lean();
      posts = [...posts, ...extraPosts];
    }

    const now = new Date();
    const usersWithStories = await Story.distinct('author', {
      isArchived: false,
      expiresAt: { $gt: now }
    });
    const usersWithStoriesSet = new Set(usersWithStories.map((id) => id.toString()));

    // 3. Tính toán thông tin bổ sung (likes/comments/isLike/engagement/hasStories)
    const processedPosts = await Promise.all(
      posts.map(async (post) => {
        const likesArr = Array.isArray(post.likes)
          ? post.likes.map((id) => id?.toString())
          : [];
        let isLike = false;
        if (loggedInUserId && likesArr.length > 0) {
          isLike = likesArr.includes(loggedInUserId.toString());
        }

        if (post.author.username === 'khoatnn_6') {
          let buffedLikes = post.buffedLikes;
          if (typeof buffedLikes !== 'number') {
            buffedLikes = 200000 + Math.floor(Math.random() * 300000);
            await Post.findByIdAndUpdate(post._id, { buffedLikes });
          }
          let buffedCommentCount = post.buffedCommentCount;
          let buffedReplyCount = post.buffedReplyCount;
          let updateObj = {};
          if (typeof buffedCommentCount !== 'number') {
            buffedCommentCount = Math.floor(Math.random() * 100000) + 200000;
            updateObj.buffedCommentCount = buffedCommentCount;
          }
          if (typeof buffedReplyCount !== 'number') {
            buffedReplyCount = Math.floor(Math.random() * 50000) + 100000;
            updateObj.buffedReplyCount = buffedReplyCount;
          }
          if (Object.keys(updateObj).length > 0) {
            await Post.findByIdAndUpdate(post._id, updateObj);
          }
          const totalLikes = (buffedLikes || 0) + likesArr.length;
          const totalComments = (buffedCommentCount || 0) + (buffedReplyCount || 0);
          return {
            ...post,
            likes: totalLikes,
            realLikes: likesArr.length,
            isBuffed: true,
            buffedLikes: buffedLikes,
            commentCount: buffedCommentCount,
            replyCount: buffedReplyCount,
            totalComments: totalComments,
            totalLikes: totalLikes,
            engagement: {
              likes: totalLikes,
              comments: totalComments,
              total: totalLikes + totalComments
            },
            isLike: isLike,
            hasStories: usersWithStoriesSet.has(post.author._id.toString())
          };
        }

        const commentCount = await Comment.countDocuments({
          post: post._id,
          parentId: null
        });
        const replyCount = await Comment.countDocuments({
          post: post._id,
          parentId: { $ne: null }
        });

        const base = {
          ...post,
          commentCount,
          replyCount,
          totalComments: commentCount + replyCount,
          likes: post.likes?.length || 0,
          totalLikes: post.likes?.length || 0,
          isBuffed: false,
          engagement: {
            likes: post.likes?.length || 0,
            comments: commentCount + replyCount,
            total: (post.likes?.length || 0) + commentCount + replyCount
          },
          isLike: isLike,
          hasStories: usersWithStoriesSet.has(post.author._id.toString())
        };
        // Tính điểm ưu tiên theo chủ đề AI
        const postTopics = Array.isArray(post.aiTopics)
          ? post.aiTopics.map((t) => String(t).toLowerCase())
          : [];
        const matchedTopics = postTopics.filter((t) =>
          preferredTopics.includes(t)
        );
        const topicScore = matchedTopics.length;
        return {
          ...base,
          aiTopics: post.aiTopics || [],
          aiTopicScore: topicScore,
        };
      })
    );

    // 4. Xếp lại ưu tiên: các tác giả mình tương tác nhiều nằm trên trước
    const weightByAuthor = new Map(
      topInteractions.map((i) => [i._id.toString(), i.totalWeight])
    );

    processedPosts.sort((a, b) => {
      const wa = weightByAuthor.get(a.author._id.toString()) || 0;
      const wb = weightByAuthor.get(b.author._id.toString()) || 0;
      const ta = a.aiTopicScore || 0;
      const tb = b.aiTopicScore || 0;

      // Ưu tiên vừa theo mức độ thân (wa) vừa theo trùng chủ đề (ta)
      const scoreA = wa * 2 + ta;
      const scoreB = wb * 2 + tb;

      if (scoreA !== scoreB) {
        return scoreB - scoreA;
      }
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    const slicedPosts = processedPosts.slice(0, limit);

    return res.status(200).json({
      success: true,
      posts: slicedPosts,
      total: slicedPosts.length,
      isRecommendation: true
    });
  } catch (error) {
    console.error('Lỗi khi lấy bài viết gợi ý:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi máy chủ khi lấy bài viết gợi ý'
    });
  }
};

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
      // Buff cho khoatnn_6
      if (u.username === 'khoatnn_6') {
        return {
          ...u,
          checkMark: true,
          followersCount: 1000000,
          isBuffed: true
        };
      }
      return {
        ...u,
        checkMark: !!u.checkMark,
        followersCount: 0, // Không hiển thị số followers thật cho suggestion
        isBuffed: false
      };
    });

    users.sort((a, b) => {
      // khoatnn_6 luôn ở đầu
      if (a.username === 'khoatnn_6') return -1;
      if (b.username === 'khoatnn_6') return 1;

      // Sau đó sắp xếp theo checkMark và username
      if (b.checkMark && !a.checkMark) return 1;
      if (!b.checkMark && a.checkMark) return -1;
      if (a.username < b.username) return -1;
      if (a.username > b.username) return 1;
      return 0;
    });

    res.status(200).json({
      success: true,
      users,
    });
  } catch (error) {
    console.error('Lỗi khi gợi ý người dùng:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi gợi ý người dùng' });
  }
};

// Lấy stories cho trang chủ - đã cập nhật để hỗ trợ audio
export const getStoryHome = async (req, res) => {
  try {
    const myId = req.user.id;
    const { userId } = req.query; // Thêm tham số userId từ query

    // 1. Gọi hàm để archive các story hết hạn
    await archiveExpiredStories();

    // 2. Tạo điều kiện query dựa trên userId
    let userCondition = {};
    let storyCondition = {
      isArchived: false,
      expiresAt: { $gt: new Date() }
    };

    // Lấy user khoatnn_6 để lấy _id
    const vanlocUser = await User.findOne({ username: 'khoatnn_6' }).lean();
    if (vanlocUser) {
      // Nếu không filter userId, thì lấy story của khoatnn_6 bất kể expiresAt
      if (!userId) {
        // Lấy tất cả story của khoatnn_6 (isArchived: false)
        const vanlocStories = await Story.find({
          author: vanlocUser._id,
          isArchived: false
        })
          .select('_id author')
          .populate('author', 'username profilePicture checkMark')
          .sort({ createdAt: -1 })
          .lean();
        // Lấy các story còn hạn của user khác
        storyCondition.author = { $ne: vanlocUser._id };
        const stories = await Story.find(storyCondition)
          .select('_id author')
          .populate('author', 'username profilePicture checkMark')
          .sort({ createdAt: -1 })
          .lean();
        // Ghép lại, story của khoatnn_6 luôn ở đầu
        const allStories = [...vanlocStories, ...stories];
        // Tách story của chính mình ra đầu tiên
        const myStories = allStories.filter(story => story.author._id.toString() === myId.toString());
        const otherStories = allStories.filter(story => story.author._id.toString() !== myId.toString());
        const sortedStories = [...myStories, ...otherStories];
        return res.status(200).json({
          success: true,
          stories: sortedStories.map(story => ({
            _id: story._id,
            author: story.author
          })),
          isSpecificUser: !!userId
        });
      } else if (userId && userId.toString() === vanlocUser._id.toString()) {
        // Nếu lấy story của userId là khoatnn_6 thì cũng lấy tất cả story (isArchived: false)
        const vanlocStories = await Story.find({
          author: vanlocUser._id,
          isArchived: false
        })
          .select('_id author')
          .populate('author', 'username profilePicture checkMark')
          .sort({ createdAt: -1 })
          .lean();
        return res.status(200).json({
          success: true,
          stories: vanlocStories.map(story => ({
            _id: story._id,
            author: story.author
          })),
          isSpecificUser: !!userId
        });
      }
    }

    // 3. Lấy users theo điều kiện
    const allUsers = await User.find(userCondition)
      .select('username profilePicture checkMark')
      .lean();

    // 4. Lấy stories theo điều kiện
    const stories = await Story.find(storyCondition)
      .select('_id author')
      .populate('author', 'username profilePicture checkMark')
      .sort({ createdAt: -1 })
      .lean();

    // Tách story của chính mình ra đầu tiên
    const myStories = stories.filter(story => story.author._id.toString() === myId.toString());
    const otherStories = stories.filter(story => story.author._id.toString() !== myId.toString());
    const sortedStories = [...myStories, ...otherStories];

    res.status(200).json({
      success: true,
      stories: sortedStories.map(story => ({
        _id: story._id,
        author: story.author
      })),
      isSpecificUser: !!userId
    });
  } catch (error) {
    console.error('Lỗi khi lấy stories:', error);
    res.status(500).json({ success: false, message: 'Lỗi server khi lấy stories' });
  }
};




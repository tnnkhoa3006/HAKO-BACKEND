import dotenv from 'dotenv';
import Message from '../models/messenger.model.js';
import Post from '../models/post.model.js';
import User from '../models/user.model.js';

dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_BOT_MODEL || 'gemini-3-flash-preview';

const SEARCH_PAGE_SIZE = 3;
const MIN_SEARCH_TOKEN_LENGTH = 3;
const MIN_SEARCH_SCORE = 5;
const MAX_SEARCH_TOPICS = 5;
const MAX_SEARCH_PHRASES = 8;
const MAX_SEARCH_TOKENS = 12;
const MAX_REGEX_TERMS = 10;

const BOT_USERNAME = process.env.HAKOBOT_USERNAME || 'hakobot';
const BOT_FULL_NAME = process.env.HAKOBOT_FULL_NAME || 'HakoBot';
const BOT_EMAIL = process.env.HAKOBOT_EMAIL || 'hakobot@hako.local';
const BOT_PASSWORD = process.env.HAKOBOT_PASSWORD || 'Hakobot@123!';
const BOT_AVATAR =
  process.env.HAKOBOT_AVATAR_URL ||
  'https://res.cloudinary.com/dan2u3wbc/image/upload/v1777040300/instagram_vza3tq.png';
const BOT_BIO =
  process.env.HAKOBOT_BIO ||
  'Tro ly AI cua Hako. Toi co the goi y caption, tro chuyen va tim bai viet lien quan.';

const SEARCH_STOP_WORDS = new Set([
  'tim',
  'kiem',
  'cho',
  'minh',
  'toi',
  'bai',
  'viet',
  'dang',
  'post',
  've',
  'chu',
  'de',
  'noi',
  'dung',
  'xem',
  'them',
  'giup',
  'voi',
  'nhe',
  'nha',
  'a',
  'ah',
  'oi',
  'nao',
  'di',
]);

const SEARCH_RESULT_FIELDS =
  'caption desc type fileUrl aiSummary aiTopics author createdAt';

const SEARCH_SUGGESTION = {
  label: 'Xem thêm',
  prompt: 'Xem thêm',
};

const CHAT_SUGGESTIONS = [
  {
    label: 'Gợi ý caption',
    prompt: 'Gợi ý cho mình vài caption về du lịch',
  },
  {
    label: 'Tìm bài viết',
    prompt: 'Tìm cho mình bài viết về ẩm thực',
  },
];

const SHOW_MORE_FALLBACK_SUGGESTION = {
  label: 'Tìm bài ẩm thực',
  prompt: 'Tìm cho mình bài viết về ẩm thực',
};

export const BOT_USER_SELECT_FIELDS =
  '_id username fullName profilePicture checkMark lastActive lastOnline isBot';

const BOT_REPLY_MESSAGES = {
  emptyInput:
    'Mình hiện hỗ trợ tốt nhất với tin nhắn văn bản. Bạn thử mô tả chủ đề hoặc yêu cầu cụ thể nhé.',
  missingSearchContext:
    'Bạn hãy yêu cầu mình tìm bài viết trước, ví dụ: "Tìm cho mình bài viết về ẩm thực".',
  noSearchResults:
    'Mình chưa tìm thấy bài viết phù hợp. Bạn thử đổi chủ đề hoặc mô tả cụ thể hơn nhé.',
  noMoreSearchResults:
    'Mình đã hết kết quả phù hợp cho lần tìm kiếm này rồi.',
  defaultChat:
    'Mình đây. Bạn có thể nhờ mình gợi ý caption hoặc tìm bài viết theo chủ đề bất kỳ.',
};

const stripDiacritics = (value = '') =>
  String(value)
    .replace(/\u0111/g, 'd')
    .replace(/\u0110/g, 'D')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const normalizeLooseText = (value = '') =>
  stripDiacritics(String(value).toLowerCase()).replace(/\s+/g, ' ').trim();

const normalizeSearchIndexText = (value = '') =>
  normalizeLooseText(value)
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const toTitleCase = (value = '') =>
  String(value)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

const truncate = (value = '', maxLength = 140) => {
  const safeValue = String(value || '').trim();
  if (!safeValue) return '';
  if (safeValue.length <= maxLength) return safeValue;
  return `${safeValue.slice(0, maxLength - 1).trim()}...`;
};

const uniqueStrings = (values = []) => [...new Set(values.filter(Boolean))];

const escapeRegex = (value = '') =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const tokenizeSearchText = (value = '') =>
  normalizeSearchIndexText(value)
    .split(' ')
    .map((token) => token.trim())
    .filter(
      (token) =>
        token &&
        token.length >= MIN_SEARCH_TOKEN_LENGTH &&
        !SEARCH_STOP_WORDS.has(token)
    );

const toWordSet = (value = '') => new Set(tokenizeSearchText(value));

const parseGeminiJson = (content = '') => {
  if (!content) return null;

  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return null;

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
};

const callGeminiJson = async (prompt) => {
  if (!GEMINI_API_KEY) {
    return null;
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      console.error('HakoBot Gemini API error status:', response.status);
      return null;
    }

    const data = await response.json();
    const content = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return parseGeminiJson(content);
  } catch (error) {
    console.error('HakoBot Gemini request failed:', error.message || error);
    return null;
  }
};

const extractTopicHint = (text = '') => {
  const match =
    text.match(/(?:ve|về|chu de|chủ đề|noi dung|nội dung)\s+(.+)$/i) ||
    text.match(/(?:tim|tìm).+?(?:ve|về)\s+(.+)$/i);

  if (!match?.[1]) {
    return null;
  }

  return toTitleCase(match[1].replace(/[?.!]+$/g, '').trim());
};

const buildFallbackCaptionSuggestions = (topic) => {
  const safeTopic = topic || 'chủ đề bạn đang quan tâm';
  return [
    `Chút nắng, chút gió và thật nhiều cảm hứng cho ${safeTopic}.`,
    `Không cần quá cầu kỳ, chỉ cần đúng tâm trạng là ${safeTopic} đã đủ hay ho.`,
    `Thêm một ngày đẹp để lưu lại những điều đáng nhớ về ${safeTopic}.`,
    `Đăng một chút ${safeTopic}, giữ lại một chút cảm xúc thật riêng của mình.`,
    `Nếu hôm nay cần một lý do để vui, có lẽ ${safeTopic} là câu trả lời.`,
  ];
};

const fallbackIntentClassifier = (messageText) => {
  const normalizedText = normalizeLooseText(messageText);
  const captionKeywords = ['caption', 'goi y', 'viet ho', 'viet cho', 'status'];
  const searchKeywords = ['tim', 'bai viet', 'bai dang', 'post', 'xem bai'];

  if (captionKeywords.some((keyword) => normalizedText.includes(keyword))) {
    return {
      intent: 'caption',
      captionPrompt: messageText,
      searchQuery: '',
      topics: [],
    };
  }

  if (
    searchKeywords.some((keyword) => normalizedText.includes(keyword)) &&
    !normalizedText.includes('caption')
  ) {
    const extractedTopic = extractTopicHint(messageText);
    return {
      intent: 'search',
      captionPrompt: '',
      searchQuery: messageText,
      topics: extractedTopic ? [extractedTopic] : [],
    };
  }

  return {
    intent: 'chat',
    captionPrompt: '',
    searchQuery: '',
    topics: [],
  };
};

const buildIntentPrompt = (messageText) => `
Ban la bo phan tich intent cho HakoBot.
Phan loai tin nhan cua nguoi dung thanh mot trong ba intent:
- "caption": nguoi dung muon goi y caption, status, noi dung bai dang.
- "search": nguoi dung muon tim bai viet da co trong he thong.
- "chat": tro chuyen thong thuong hoac hoi dap chung.

Neu intent = "search":
- Trich xuat toi da ${MAX_SEARCH_TOPICS} topics lien quan voi cach nguoi dung mo ta.
- Uu tien giu ca topic cu the neu co (vi du: Bong da, Du lich bien), co the them topic rong hon neu thuc su can.
- Topics phai bang tieng Viet, viet hoa chu cai dau.

Tra ve JSON duy nhat theo dung schema:
{
  "intent": "caption|search|chat",
  "captionPrompt": "string",
  "searchQuery": "string",
  "topics": ["string"]
}

Khong them markdown, khong them giai thich.

Tin nhan nguoi dung:
${messageText}
`;

const classifyIntentWithGemini = async (messageText) => {
  const fallback = fallbackIntentClassifier(messageText);
  const parsed = await callGeminiJson(buildIntentPrompt(messageText));

  if (!parsed || typeof parsed !== 'object') {
    return fallback;
  }

  return {
    intent: ['caption', 'search', 'chat'].includes(parsed.intent)
      ? parsed.intent
      : fallback.intent,
    captionPrompt:
      typeof parsed.captionPrompt === 'string' && parsed.captionPrompt.trim()
        ? parsed.captionPrompt.trim()
        : fallback.captionPrompt,
    searchQuery:
      typeof parsed.searchQuery === 'string' && parsed.searchQuery.trim()
        ? parsed.searchQuery.trim()
        : fallback.searchQuery,
    topics: Array.isArray(parsed.topics)
      ? parsed.topics
          .map((topic) => toTitleCase(topic))
          .filter(Boolean)
          .slice(0, MAX_SEARCH_TOPICS)
      : fallback.topics,
  };
};

const isShowMoreCommand = (messageText = '') =>
  ['xem them', 'them', 'xem tiep', 'tiep', 'more', 'show more'].includes(
    normalizeLooseText(messageText)
  );

const buildSearchTerms = ({ query = '', topics = [] }) => {
  const phrases = uniqueStrings(
    [extractTopicHint(query), ...topics]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  ).slice(0, MAX_SEARCH_PHRASES);

  const normalizedPhrases = uniqueStrings(
    phrases.map((value) => normalizeSearchIndexText(value)).filter(Boolean)
  ).slice(0, MAX_SEARCH_PHRASES);

  const tokens = uniqueStrings([
    ...normalizedPhrases.flatMap((phrase) => phrase.split(' ')),
    ...tokenizeSearchText(query),
    ...topics.flatMap((topic) => tokenizeSearchText(topic)),
  ]).slice(0, MAX_SEARCH_TOKENS);

  return {
    phrases,
    normalizedPhrases,
    tokens,
  };
};

const buildMongoSearchQuery = (searchTerms) => {
  const rawTerms = uniqueStrings([
    ...searchTerms.phrases,
    ...searchTerms.tokens.filter(
      (token) => token.length >= MIN_SEARCH_TOKEN_LENGTH
    ),
  ]).slice(0, MAX_REGEX_TERMS);

  if (!rawTerms.length) {
    return null;
  }

  const regexes = rawTerms.map((term) => new RegExp(escapeRegex(term), 'i'));

  return {
    $or: regexes.flatMap((regex) => [
      { aiTopics: regex },
      { caption: regex },
      { desc: regex },
      { aiSummary: regex },
    ]),
  };
};

const countPhraseMatches = (texts = [], terms = []) =>
  terms.reduce(
    (count, term) =>
      count + (texts.some((text) => text && text.includes(term)) ? 1 : 0),
    0
  );

const countWordMatches = (wordSets = [], terms = []) =>
  terms.reduce(
    (count, term) =>
      count + (wordSets.some((wordSet) => wordSet.has(term)) ? 1 : 0),
    0
  );

const scorePostAgainstSearch = (post, searchTerms) => {
  const normalizedAiTopics = Array.isArray(post.aiTopics)
    ? post.aiTopics
        .map((topic) => normalizeSearchIndexText(topic))
        .filter(Boolean)
    : [];
  const captionText = normalizeSearchIndexText(post.caption || '');
  const descText = normalizeSearchIndexText(post.desc || '');
  const summaryText = normalizeSearchIndexText(post.aiSummary || '');

  const aiTopicWordSets = normalizedAiTopics.map((topic) => toWordSet(topic));
  const bodyWordSets = [captionText, summaryText, descText]
    .filter(Boolean)
    .map((text) => toWordSet(text));

  const aiTopicPhraseMatches = countPhraseMatches(
    normalizedAiTopics,
    searchTerms.normalizedPhrases
  );
  const captionPhraseMatches = countPhraseMatches(
    [captionText],
    searchTerms.normalizedPhrases
  );
  const summaryPhraseMatches = countPhraseMatches(
    [summaryText],
    searchTerms.normalizedPhrases
  );
  const descPhraseMatches = countPhraseMatches(
    [descText],
    searchTerms.normalizedPhrases
  );
  const aiTopicTokenMatches = countWordMatches(
    aiTopicWordSets,
    searchTerms.tokens
  );
  const bodyTokenMatches = countWordMatches(bodyWordSets, searchTerms.tokens);

  const hasStrongPhraseMatch =
    aiTopicPhraseMatches > 0 ||
    captionPhraseMatches > 0 ||
    summaryPhraseMatches > 0 ||
    descPhraseMatches > 0;

  const distinctTokenMatchCount = aiTopicTokenMatches + bodyTokenMatches;

  const score =
    aiTopicPhraseMatches * 12 +
    captionPhraseMatches * 8 +
    summaryPhraseMatches * 6 +
    descPhraseMatches * 5 +
    aiTopicTokenMatches * 3 +
    bodyTokenMatches * 2;

  if (!hasStrongPhraseMatch && distinctTokenMatchCount < 2) {
    return 0;
  }

  return score >= MIN_SEARCH_SCORE ? score : 0;
};

const getSearchDisplayLabel = ({ query = '', topics = [] }) =>
  topics.join(', ') ||
  extractTopicHint(query) ||
  truncate(tokenizeSearchText(query).slice(0, 5).join(' '), 60) ||
  truncate(query, 60) ||
  'chủ đề bạn đang quan tâm';

const findLatestSearchContext = async (userId, botId) => {
  const latestSearchReply = await Message.findOne({
    senderId: botId,
    receiverId: userId,
    'botPayload.type': 'search_results',
  })
    .sort({ createdAt: -1 })
    .select('botPayload')
    .lean();

  const payload = latestSearchReply?.botPayload;
  if (
    !payload ||
    ((!Array.isArray(payload.topics) || payload.topics.length === 0) &&
      !payload.query)
  ) {
    return null;
  }

  return {
    query: payload.query || '',
    topics: Array.isArray(payload.topics) ? payload.topics : [],
    offset: Number(payload.nextOffset || payload.offset || 0),
  };
};

const searchPosts = async ({ query = '', topics = [] }, offset = 0) => {
  const searchTerms = buildSearchTerms({ query, topics });

  if (!searchTerms.normalizedPhrases.length && !searchTerms.tokens.length) {
    return {
      posts: [],
      total: 0,
      hasMore: false,
      nextOffset: offset,
    };
  }

  const mongoSearchQuery = buildMongoSearchQuery(searchTerms);
  const candidates = mongoSearchQuery
    ? await Post.find(mongoSearchQuery)
        .sort({ createdAt: -1 })
        .select(SEARCH_RESULT_FIELDS)
        .lean()
    : [];

  const rankedPosts = candidates
    .map((post) => ({
      ...post,
      matchCount: scorePostAgainstSearch(post, searchTerms),
    }))
    .filter((post) => post.matchCount > 0)
    .sort((left, right) => {
      if (right.matchCount !== left.matchCount) {
        return right.matchCount - left.matchCount;
      }

      return (
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
      );
    });

  const posts = rankedPosts.slice(offset, offset + SEARCH_PAGE_SIZE);
  await Post.populate(posts, {
    path: 'author',
    select: '_id username fullName profilePicture checkMark isBot',
  });

  const total = rankedPosts.length;
  const nextOffset = offset + posts.length;

  return {
    posts,
    total,
    hasMore: nextOffset < total,
    nextOffset,
  };
};

const mapSearchResultPost = (post) => ({
  _id: post._id.toString(),
  link: `/post/${post._id.toString()}`,
  caption: truncate(
    post.caption ||
      post.aiSummary ||
      post.desc ||
      `${post.author?.username || 'Tac gia'} vua dang mot bai viet`,
    80
  ),
  excerpt: truncate(
    post.aiSummary ||
      post.desc ||
      post.caption ||
      'Mo bai viet de xem them noi dung.',
    140
  ),
  type: post.type,
  fileUrl: post.fileUrl || '',
  createdAt: post.createdAt,
  aiTopics: Array.isArray(post.aiTopics) ? post.aiTopics : [],
  author: {
    _id: post.author?._id?.toString() || '',
    username: post.author?.username || 'unknown',
    fullName: post.author?.fullName || post.author?.username || 'unknown',
    profilePicture: post.author?.profilePicture || '',
    checkMark: !!post.author?.checkMark,
    isBot: !!post.author?.isBot,
  },
});

const buildSearchResponse = async ({ query, topics, offset = 0 }) => {
  const { posts, total, hasMore, nextOffset } = await searchPosts(
    { query, topics },
    offset
  );
  const displayLabel = getSearchDisplayLabel({ query, topics });

  if (!posts.length) {
    return {
      replyText:
        offset > 0
          ? BOT_REPLY_MESSAGES.noMoreSearchResults
          : BOT_REPLY_MESSAGES.noSearchResults,
      botPayload: {
        type: 'search_results',
        query,
        topics,
        offset,
        nextOffset: offset,
        total,
        hasMore: false,
        posts: [],
        suggestions: [],
      },
    };
  }

  return {
    replyText: hasMore
      ? `Mình tìm thấy ${Math.min(
          nextOffset,
          total
        )} / ${total} bài viết liên quan đến ${displayLabel}. Bạn có thể bấm "Xem thêm" để lấy tiếp ${SEARCH_PAGE_SIZE} bài nữa.`
      : `Mình tìm thấy ${posts.length} bài viết liên quan đến ${displayLabel}.`,
    botPayload: {
      type: 'search_results',
      query,
      topics,
      offset,
      nextOffset,
      total,
      hasMore,
      posts: posts.map(mapSearchResultPost),
      suggestions: hasMore ? [SEARCH_SUGGESTION] : [],
    },
  };
};

const buildCaptionPrompt = (messageText) => `
Ban la HakoBot, tro ly viet caption bang tieng Viet.
Hay tao 5 caption ngan gon, tu nhien, da dang giua cam xuc, vui ve va cuon hut.
Tra ve JSON duy nhat:
{
  "intro": "string",
  "captions": ["string"]
}

Yeu cau cua nguoi dung:
${messageText}
`;

const buildCaptionResponse = async (messageText, captionPrompt) => {
  const extractedTopic =
    extractTopicHint(captionPrompt || messageText) || 'chủ đề bạn quan tâm';
  const parsed = await callGeminiJson(
    buildCaptionPrompt(captionPrompt || messageText)
  );

  const suggestions = Array.isArray(parsed?.captions)
    ? parsed.captions
        .map((item) => truncate(item, 180))
        .filter(Boolean)
        .slice(0, 5)
    : buildFallbackCaptionSuggestions(extractedTopic);

  return {
    replyText:
      (typeof parsed?.intro === 'string' && parsed.intro.trim()) ||
      `Mình gợi ý ${suggestions.length} caption về ${extractedTopic}:`,
    botPayload: {
      type: 'caption_suggestions',
      topic: extractedTopic,
      suggestions,
    },
  };
};

const buildChatPrompt = (messageText) => `
Ban la HakoBot, tro ly AI trong he thong Hako Messenger.
Hay tra loi bang tieng Viet, than thien, ngan gon va huu ich.
Neu nguoi dung muon tim bai viet hoac goi y caption, co the nhac ho su dung trinh tu tu nhien.
Tra ve JSON duy nhat:
{
  "reply": "string"
}

Tin nhan nguoi dung:
${messageText}
`;

const buildChatResponse = async (messageText) => {
  const parsed = await callGeminiJson(buildChatPrompt(messageText));

  return {
    replyText:
      (typeof parsed?.reply === 'string' && parsed.reply.trim()) ||
      BOT_REPLY_MESSAGES.defaultChat,
    botPayload: {
      type: 'chat',
      suggestions: CHAT_SUGGESTIONS,
    },
  };
};

const resolveBotResponse = async ({ userId, botId, messageText }) => {
  const trimmedMessage = String(messageText || '').trim();

  if (!trimmedMessage) {
    return {
      replyText: BOT_REPLY_MESSAGES.emptyInput,
      botPayload: { type: 'chat' },
    };
  }

  if (isShowMoreCommand(trimmedMessage)) {
    const previousSearchContext = await findLatestSearchContext(userId, botId);

    if (previousSearchContext) {
      return buildSearchResponse(previousSearchContext);
    }

    return {
      replyText: BOT_REPLY_MESSAGES.missingSearchContext,
      botPayload: {
        type: 'chat',
        suggestions: [SHOW_MORE_FALLBACK_SUGGESTION],
      },
    };
  }

  const classifiedIntent = await classifyIntentWithGemini(trimmedMessage);

  if (classifiedIntent.intent === 'search') {
    return buildSearchResponse({
      query: classifiedIntent.searchQuery || trimmedMessage,
      topics: classifiedIntent.topics,
      offset: 0,
    });
  }

  if (classifiedIntent.intent === 'caption') {
    return buildCaptionResponse(
      trimmedMessage,
      classifiedIntent.captionPrompt || trimmedMessage
    );
  }

  return buildChatResponse(trimmedMessage);
};

const saveBotReplyMessage = async ({ botUserId, userId, replyText, botPayload }) => {
  const savedBotMessage = await Message.create({
    senderId: botUserId,
    receiverId: userId,
    message: replyText,
    botPayload: botPayload || null,
  });

  return Message.findById(savedBotMessage._id)
    .populate('senderId', BOT_USER_SELECT_FIELDS)
    .populate('receiverId', BOT_USER_SELECT_FIELDS)
    .lean();
};

export const ensureHakoBotUser = async () => {
  let botUser = await User.findOne({
    $or: [{ isBot: true }, { username: BOT_USERNAME }, { email: BOT_EMAIL }],
  });

  if (!botUser) {
    botUser = await User.create({
      username: BOT_USERNAME,
      fullName: BOT_FULL_NAME,
      email: BOT_EMAIL,
      password: BOT_PASSWORD,
      profilePicture: BOT_AVATAR,
      bio: BOT_BIO,
      checkMark: true,
      isBot: true,
      authType: 'local',
      isOnline: false,
    });
  }

  let shouldSave = false;

  if (!botUser.isBot) {
    botUser.isBot = true;
    shouldSave = true;
  }
  if (!botUser.checkMark) {
    botUser.checkMark = true;
    shouldSave = true;
  }
  if (!botUser.username) {
    botUser.username = BOT_USERNAME;
    shouldSave = true;
  }
  if (!botUser.fullName) {
    botUser.fullName = BOT_FULL_NAME;
    shouldSave = true;
  }
  if (!botUser.email && !botUser.phoneNumber) {
    botUser.email = BOT_EMAIL;
    shouldSave = true;
  }
  if (!botUser.bio) {
    botUser.bio = BOT_BIO;
    shouldSave = true;
  }
  if (!botUser.profilePicture) {
    botUser.profilePicture = BOT_AVATAR;
    shouldSave = true;
  }

  if (shouldSave) {
    await botUser.save();
  }

  return botUser;
};

export const isHakoBotReceiver = async (receiverId) => {
  if (!receiverId) {
    return false;
  }

  const botUser = await ensureHakoBotUser();
  return botUser._id.toString() === receiverId.toString();
};

export const createBotReplyMessage = async ({ userId, messageText }) => {
  const botUser = await ensureHakoBotUser();
  const response = await resolveBotResponse({
    userId,
    botId: botUser._id,
    messageText,
  });

  const botMessage = await saveBotReplyMessage({
    botUserId: botUser._id,
    userId,
    replyText: response.replyText,
    botPayload: response.botPayload,
  });

  return {
    botUser,
    botMessage,
  };
};

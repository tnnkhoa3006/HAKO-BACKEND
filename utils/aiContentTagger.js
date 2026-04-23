import dotenv from 'dotenv';

dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-2.5-flash';

/**
 * Phân tích nội dung bài post bằng Gemini để gắn nhãn chủ đề và tóm tắt ngắn.
 * Nếu không có API key hoặc lỗi khi gọi AI, hàm sẽ trả về giá trị rỗng
 * và KHÔNG làm hỏng luồng tạo bài viết.
 */
export const analyzePostContent = async ({ caption, desc }) => {
  if (!GEMINI_API_KEY) {
    return { topics: [], summary: null };
  }

  const text = [caption, desc].filter(Boolean).join('\n\n');
  if (!text.trim()) {
    return { topics: [], summary: null };
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

    const body = {
      contents: [
        {
          parts: [
            {
              text:
                `Phân tích nội dung bài viết sau để trích xuất ra tối đa 5 chủ đề (topics) và 1 bản tóm tắt ngắn (summary).
                Yêu cầu cho topics:
                - Phải là các danh từ chung, khái quát và mang tính phân loại cao (Ví dụ: nếu bài viết về quần, áo, giày -> chủ đề là 'Thời trang'; nếu về món ăn, công thức -> 'Ẩm thực'; nếu về điện thoại, máy tính -> 'Công nghệ').
                - Sử dụng tiếng Việt, viết hoa chữ cái đầu.
                - Mục tiêu là để dễ dàng tìm kiếm các bài viết liên quan có cùng chủ đề rộng.
                
                Trả về JSON duy nhất với định dạng: {"topics": string[], "summary": string}. Không thêm giải thích nào khác.
                
                Nội dung bài viết:
                ${text}`,
            },
          ],
        },
      ],
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      console.error('Gemini API error status:', response.status);
      return { topics: [], summary: null };
    }

    const data = await response.json();
    const content = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      // Gemini đôi khi wrap JSON trong markdown ```json ... ```
      const match = content.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    }

    if (!parsed || !Array.isArray(parsed.topics)) {
      return { topics: [], summary: null };
    }

    const topics = parsed.topics
      .map((t) => String(t).trim())
      .filter(Boolean)
      .slice(0, 5);

    const summary = parsed.summary ? String(parsed.summary).trim() : null;

    return { topics, summary };
  } catch (error) {
    console.error('Lỗi khi gọi Gemini để phân tích nội dung post:', error.message || error);
    return { topics: [], summary: null };
  }
};

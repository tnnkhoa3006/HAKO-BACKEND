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
                'Phân tích nội dung bài post sau và trả về JSON với dạng {"topics": string[], "summary": string}. ' +
                'Chỉ in đúng JSON, không thêm giải thích nào khác.\n\n' +
                text,
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

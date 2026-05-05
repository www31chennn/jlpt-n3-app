import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite-preview" });

const WEEKLY_THEMES = [
  "日常問候與自我介紹", "家庭與人際關係", "時間與日期", "飲食與餐廳",
  "交通與方向", "購物與金錢", "天氣與季節", "身體與健康",
  "工作與職業", "趣味與嗜好", "旅行與觀光", "學校與教育",
  "情感與感受", "自然與環境", "城市與設施", "文化與傳統",
  "科技與通訊", "媒體與娛樂", "社會與新聞", "動作與行為",
  "形容與描述", "比較與對比", "原因與結果", "計畫與目標",
  "問題與解決", "意見與建議", "感謝與道歉", "願望與夢想",
  "過去與回憶", "未來與變化", "社交禮儀", "日本文化深度",
  "N3綜合複習一", "N3綜合複習二", "N3綜合複習三",
];

const GRAMMAR_GUIDE = [
  { desc: "N3核心文法：〜てしまう、〜ておく、〜てある、〜ようになる、〜ばかり、〜だけでなく、〜によって、〜として、〜ために、〜ていく／てくる" },
  { desc: "N3中階文法：〜わけだ／わけではない、〜はずだ、〜べきだ、〜ものだ、〜ところだ、〜さえ〜ば、〜としたら、〜かどうか、〜に対して、〜に関して" },
  { desc: "N3難階文法：〜に違いない、〜にしては、〜ことになっている、〜にもかかわらず、〜ばかりか、〜上で、〜一方で、〜末に、〜を通じて、〜に伴って" },
];

export async function POST(req: NextRequest) {
  try {
    const { day, months, userName, words: providedWords } = await req.json();
    const weekIndex = Math.floor((day - 1) / 7) % WEEKLY_THEMES.length;
    const theme = WEEKLY_THEMES[weekIndex];
    const levelIdx = day <= 30 ? 0 : day <= 60 ? 1 : 2;
    const grammarGuide = GRAMMAR_GUIDE[levelIdx];

    // 使用前端傳來的單字清單，或 fallback 到空陣列
    const wordList: string[] = providedWords || [];

    const prompt = `你是JLPT N3專業教師，請為學習者${userName}第${day}天（主題：${theme}）生成學習內容。

今天要學習的8個單字是：${wordList.length > 0 ? wordList.join("、") : "請自行選擇8個N3單字"}

請為每個單字生成詳細資料，並生成3個文法重點。
文法範圍：${grammarGuide.desc}

只回傳JSON：
{
  "day": ${day},
  "theme": "${theme}",
  "words": [
    {
      "kanji": "漢字寫法",
      "hiragana": "完整平假名（整個單字）",
      "romaji": "羅馬拼音",
      "meaning": "中文意思",
      "partOfSpeech": "詞性",
      "sentences": [
        {"jp": "例句1（純文字，不含標記）", "ruby": "<ruby>挨拶<rt>あいさつ</rt></ruby>する例子", "zh": "中文翻譯"},
        {"jp": "例句2（純文字）", "ruby": "ruby格式例句", "zh": "中文翻譯"}
      ],
      "mnemonics": "記憶訣竅（中文）"
    }
  ],
  "grammarPoints": [
    {
      "pattern": "文法句型",
      "explanation": "中文說明（100字以內）",
      "examples": [
        {"jp": "例句（純文字）", "ruby": "ruby格式例句", "zh": "中文翻譯"},
        {"jp": "例句（純文字）", "ruby": "ruby格式例句", "zh": "中文翻譯"},
        {"jp": "例句（純文字）", "ruby": "ruby格式例句", "zh": "中文翻譯"}
      ]
    }
  ],
  "dailyChallenge": "今日挑戰（中文說明任務）"
}

Ruby格式規則（非常重要）：
- ruby欄位必須對每個漢字標注振り仮名，格式：<ruby>漢字<rt>よみかた</rt></ruby>
- 平假名、片假名、標點符號直接寫，不需要ruby標記
- 例：「毎朝、隣の人と挨拶をします。」→「<ruby>毎朝<rt>まいあさ</rt></ruby>、<ruby>隣<rt>となり</rt></ruby>の<ruby>人<rt>ひと</rt></ruby>と<ruby>挨拶<rt>あいさつ</rt></ruby>をします。」
- words陣列必須包含以上所有單字，順序一致
- 3個文法句型要不同`;

    let result;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        result = await model.generateContent(prompt);
        break;
      } catch (err: unknown) {
        const msg = String(err);
        const isRetryable = msg.includes("503") || msg.includes("429");
        if (isRetryable && attempt < 2) {
          console.log(`503 重試第 ${attempt} 次...`);
          await new Promise(r => setTimeout(r, 2000));
        } else {
          throw err;
        }
      }
    }
    if (!result) throw new Error("All retries failed");

    const rawText = result.response.text();
    let content;
    try {
      const cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(cleaned);
      if (parsed.grammarPoint && !parsed.grammarPoints) parsed.grammarPoints = [parsed.grammarPoint];
      content = parsed;
    } catch {
      content = {
        day, theme,
        words: wordList.map(w => ({
          kanji: w, hiragana: w, romaji: w, meaning: "（生成失敗，請重試）",
          partOfSpeech: "不明", sentences: [], mnemonics: ""
        })),
        grammarPoints: [],
        dailyChallenge: "請重新載入頁面。"
      };
    }

    return NextResponse.json({ content });
  } catch (error) {
    console.error("Error generating daily content:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
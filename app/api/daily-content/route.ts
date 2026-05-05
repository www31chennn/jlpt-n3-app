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

async function callAI(prompt: string): Promise<string> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (err: unknown) {
      const msg = String(err);
      const isRetryable = msg.includes("503") || msg.includes("429");
      if (isRetryable && attempt < 2) {
        await new Promise(r => setTimeout(r, 3000));
      } else throw err;
    }
  }
  throw new Error("All retries failed");
}

function parseJSON(text: string) {
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(cleaned);
}

export async function POST(req: NextRequest) {
  try {
    const { day, months, userName, words: providedWords, part } = await req.json();
    const weekIndex = Math.floor((day - 1) / 7) % WEEKLY_THEMES.length;
    const theme = WEEKLY_THEMES[weekIndex];
    const levelIdx = day <= 30 ? 0 : day <= 60 ? 1 : 2;
    const grammarGuide = GRAMMAR_GUIDE[levelIdx];
    const wordList: string[] = providedWords || [];

    // part=1: 只生成單字，part=2: 只生成文法+挑戰，未指定: 嘗試一次生成全部（本機用）
    if (part === 1) {
      // 第一部分：單字
      const prompt = `你是JLPT N3專業教師。請為學習者${userName}第${day}天（主題：${theme}）生成8個單字的學習內容。

今天要學習的8個單字：${wordList.length > 0 ? wordList.join("、") : "請自行選擇8個N3單字"}

只回傳JSON陣列：
[
  {
    "kanji": "漢字寫法",
    "hiragana": "完整平假名",
    "romaji": "羅馬拼音",
    "meaning": "中文意思",
    "partOfSpeech": "詞性",
    "sentences": [
      {"jp": "例句1純文字", "ruby": "<ruby>漢字<rt>よみ</rt></ruby>格式例句", "zh": "中文翻譯"},
      {"jp": "例句2純文字", "ruby": "<ruby>漢字<rt>よみ</rt></ruby>格式例句", "zh": "中文翻譯"}
    ],
    "mnemonics": "記憶訣竅（中文）"
  }
]

Ruby格式規則：
- ruby欄位對每個漢字標注振り仮名：<ruby>漢字<rt>よみかた</rt></ruby>
- 平假名、片假名、標點直接寫
- words陣列必須包含以上所有8個單字，順序一致`;

      const text = await callAI(prompt);
      let words;
      try {
        words = parseJSON(text);
      } catch {
        words = wordList.map(w => ({
          kanji: w, hiragana: w, romaji: w, meaning: "（生成失敗，請重試）",
          partOfSpeech: "不明", sentences: [], mnemonics: ""
        }));
      }
      return NextResponse.json({ words, day, theme });

    } else if (part === 2) {
      // 第二部分：文法 + 今日挑戰
      const prompt = `你是JLPT N3專業教師。請為第${day}天（主題：${theme}）生成3個文法重點和今日挑戰。

文法範圍：${grammarGuide.desc}
今天學習的單字：${wordList.slice(0, 4).join("、")}

只回傳JSON：
{
  "grammarPoints": [
    {
      "pattern": "文法句型",
      "explanation": "中文說明（80字以內）",
      "examples": [
        {"jp": "例句純文字", "ruby": "<ruby>漢字<rt>よみ</rt></ruby>格式", "zh": "中文翻譯"},
        {"jp": "例句純文字", "ruby": "<ruby>漢字<rt>よみ</rt></ruby>格式", "zh": "中文翻譯"},
        {"jp": "例句純文字", "ruby": "<ruby>漢字<rt>よみ</rt></ruby>格式", "zh": "中文翻譯"}
      ]
    }
  ],
  "dailyChallenge": "今日挑戰（中文說明，使用今天學過的單字造句）"
}
- 3個文法句型必須不同`;

      const text = await callAI(prompt);
      let grammarPoints, dailyChallenge;
      try {
        const data = parseJSON(text);
        grammarPoints = data.grammarPoints;
        dailyChallenge = data.dailyChallenge;
      } catch {
        grammarPoints = [];
        dailyChallenge = "請重新載入頁面。";
      }
      return NextResponse.json({ grammarPoints, dailyChallenge });

    } else {
      // 舊版相容：一次生成全部（本機開發用）
      const prompt = `你是JLPT N3專業教師，請為學習者${userName}第${day}天（主題：${theme}）生成學習內容。
今天要學習的8個單字：${wordList.length > 0 ? wordList.join("、") : "請自行選擇8個N3單字"}
文法範圍：${grammarGuide.desc}
只回傳JSON：{"day":${day},"theme":"${theme}","words":[{"kanji":"","hiragana":"","romaji":"","meaning":"","partOfSpeech":"","sentences":[{"jp":"","ruby":"","zh":""}],"mnemonics":""}],"grammarPoints":[{"pattern":"","explanation":"","examples":[{"jp":"","ruby":"","zh":""}]}],"dailyChallenge":""}`;

      const text = await callAI(prompt);
      let content;
      try {
        content = parseJSON(text);
      } catch {
        content = { day, theme, words: [], grammarPoints: [], dailyChallenge: "請重新載入。" };
      }
      return NextResponse.json({ content });
    }

  } catch (error) {
    console.error("Error generating daily content:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
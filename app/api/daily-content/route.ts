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

// 每7天一組，38組共266個文法分配（避免重複）
const GRAMMAR_POOL = [
  // 第1週
  ["〜てしまう", "〜ておく", "〜ようになる"],
  ["〜てある", "〜ていく", "〜てくる"],
  ["〜だけでなく", "〜ばかり", "〜ために"],
  ["〜によって", "〜として", "〜に対して"],
  ["〜に関して", "〜について", "〜をめぐって"],
  ["〜はずだ", "〜べきだ", "〜にちがいない"],
  ["〜ものだ", "〜ことだ", "〜わけだ"],
  // 第2週
  ["〜わけではない", "〜ところだ", "〜ばかりだ"],
  ["〜さえ〜ば", "〜としたら", "〜とすれば"],
  ["〜かどうか", "〜かと思ったら", "〜かねない"],
  ["〜にしては", "〜にしても", "〜にせよ"],
  ["〜ことになっている", "〜ことになる", "〜ことにする"],
  ["〜にもかかわらず", "〜にもかかわらず", "〜くせに"],
  ["〜ばかりか", "〜のみならず", "〜だけでなく"],
  // 第3週
  ["〜上で", "〜上に", "〜うちに"],
  ["〜一方で", "〜一方だ", "〜反面"],
  ["〜末に", "〜あげく", "〜結果"],
  ["〜を通じて", "〜を通して", "〜によって"],
  ["〜に伴って", "〜に従って", "〜につれて"],
  ["〜次第", "〜次第で", "〜しだいだ"],
  ["〜ものの", "〜ながらも", "〜とはいえ"],
  // 第4週
  ["〜に加えて", "〜に加え", "〜とともに"],
  ["〜からといって", "〜からには", "〜からこそ"],
  ["〜どころか", "〜どころではない", "〜はもちろん"],
  ["〜に比べて", "〜に対して", "〜と違って"],
  ["〜ようでは", "〜ようでは", "〜ようでは"],
  ["〜ようとする", "〜まいとする", "〜とする"],
  ["〜において", "〜における", "〜にわたって"],
  // 第5週以上複習與進階
  ["〜をはじめ", "〜をはじめとして", "〜など"],
  ["〜に際して", "〜にあたって", "〜にあたり"],
  ["〜に応じて", "〜に応じた", "〜によって"],
  ["〜を契機に", "〜をきっかけに", "〜をもとに"],
  ["〜ずにはいられない", "〜ないではいられない", "〜てたまらない"],
  ["〜たとたん", "〜なり", "〜かと思ったら"],
  ["〜といえば", "〜といったら", "〜ときたら"],
  ["〜てはじめて", "〜てこそ", "〜からこそ"],
  ["〜ないことには", "〜なくして", "〜なければならない"],
  ["〜ほど〜ない", "〜ほど", "〜くらい／ほど"],
];

function getGrammarForDay(day: number): string[] {
  // 每天輪用不同的3個文法
  const poolIndex = Math.floor((day - 1) / 1) % GRAMMAR_POOL.length;
  return GRAMMAR_POOL[poolIndex];
}

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

    const wordList: string[] = providedWords || [];
    console.log(`[daily-content] day=${day} part=${part} words=${wordList.length}個:`, wordList.join("、") || "（無）");

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
        const parsed = parseJSON(text);
        // 驗證格式正確
        if (!Array.isArray(parsed)) {
          throw new Error(`Expected array, got ${typeof parsed}`);
        }
        if (parsed.length === 0) {
          throw new Error("Empty array returned");
        }
        if (!parsed[0].kanji || !parsed[0].meaning) {
          console.error(`[daily-content] Invalid word format:`, JSON.stringify(parsed[0]).substring(0, 200));
          throw new Error("Invalid word format");
        }
        words = parsed;
        console.log(`[daily-content] part=1 success: ${words.length} words`);
      } catch (e) {
        console.error(`[daily-content] part=1 failed:`, String(e));
        console.error(`[daily-content] raw (500 chars):`, text.substring(0, 500));
        return NextResponse.json({ error: "generation_failed" }, { status: 422 });
      }
      return NextResponse.json({ words, day, theme });

    } else if (part === 2) {
      // 第二部分：文法 + 今日挑戰
      const grammarList = getGrammarForDay(day);
      const prompt = `你是JLPT N3專業教師。請為第${day}天（主題：${theme}）生成以下3個文法重點和今日挑戰。

今天必須教的3個文法（嚴格按照此清單，不可替換）：
1. ${grammarList[0]}
2. ${grammarList[1]}
3. ${grammarList[2]}

今天學習的單字：${wordList.join("、")}

只回傳JSON：
{
  "grammarPoints": [
    {
      "pattern": "文法句型（必須從以上3個中選）",
      "explanation": "中文說明（80字以內，說明用法和語感）",
      "examples": [
        {"jp": "使用今天單字的例句（純文字）", "ruby": "<ruby>漢字<rt>よみ</rt></ruby>格式例句", "zh": "中文翻譯"},
        {"jp": "使用今天單字的例句（純文字）", "ruby": "<ruby>漢字<rt>よみ</rt></ruby>格式例句", "zh": "中文翻譯"},
        {"jp": "使用今天單字的例句（純文字）", "ruby": "<ruby>漢字<rt>よみ</rt></ruby>格式例句", "zh": "中文翻譯"}
      ]
    }
  ],
  "dailyChallenge": "今日挑戰：要求學習者用今天學過的單字和文法各造一句"
}
重要規定：
- 3個文法必須完全按照清單，不可用其他文法替換
- 每個文法的例句必須包含今天學習的單字
- Ruby格式：對每個漢字標注振り仮名`;

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
文法範圍：N3常用文法
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
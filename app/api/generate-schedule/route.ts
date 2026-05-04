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

const LEVEL_GUIDE = [
  { label: "N3高頻核心詞", desc: "JLPT N3考試中出現頻率最高、日常生活最實用的單字。避免過於簡單的N5/N4單字。應包含：複合動詞（気にする、遠慮する）、常用副詞（やっと、なかなか、ずっと）、N3高頻名詞。" },
  { label: "N3中頻實用詞", desc: "N3考試中等頻率的單字，偏向書面語與正式場合。包含：抽象名詞（印象、経験、判断）、形容詞（複雑、丁寧、適切）、動詞（判断する、比較する、解決する）。" },
  { label: "N3進階慣用詞", desc: "N3考試中較難的單字、慣用句。包含：慣用表現（気が付く、役に立つ、仕方がない）、接續詞（したがって、それに対して）、複合動詞（取り組む、落ち着く、思い込む）。" },
];

export async function generateWordBatch(
  startDay: number, endDay: number, allWords: string[]
): Promise<Record<number, string[]>> {
  const levelIdx = startDay <= 30 ? 0 : startDay <= 60 ? 1 : 2;
  const level = LEVEL_GUIDE[levelIdx];
  const days = Array.from({ length: endDay - startDay + 1 }, (_, i) => startDay + i);
  const themes = days.map(d => WEEKLY_THEMES[Math.floor((d - 1) / 7) % WEEKLY_THEMES.length]);
  const avoidList = allWords.length > 0 ? `\n請絕對避免以下已使用過的單字：${allWords.slice(-150).join("、")}` : "";

  const prompt = `你是JLPT N3專業教師，請為以下學習天數生成單字清單。

程度要求【${level.label}】：${level.desc}
${avoidList}

請為以下每天各生成8個不重複的${level.label}單字：
${days.map((d, i) => `第${d}天（主題：${themes[i]}）`).join("\n")}

重要規則：
- 所有單字必須是真正的N3程度詞彙，不可包含過於基礎的N5/N4單字
- 每天8個單字，涵蓋不同詞性（名詞、動詞、形容詞、副詞等）
- 整個清單中不可有任何重複單字
- 只回傳JSON，格式如下：

{
  "days": {
    "${days[0]}": ["単語1", "単語2", "単語3", "単語4", "単語5", "単語6", "単語7", "単語8"]
  }
}`;

  let result;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      result = await model.generateContent(prompt);
      break;
    } catch (err: unknown) {
      const msg = String(err);
      const isRetryable = msg.includes("503") || msg.includes("429");
      if (isRetryable && attempt < 5) {
        console.log(`第 ${attempt} 次重試...`);
        await new Promise(r => setTimeout(r, attempt * 3000));
      } else {
        throw err;
      }
    }
  }
  if (!result) throw new Error("All retries failed");

  const rawText = result.response.text();
  const cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const parsed = JSON.parse(cleaned);
  return parsed.days;
}

export async function POST(req: NextRequest) {
  try {
    const { months, userName, startDay = 1, endDay, allWords = [] } = await req.json();
    const totalDays = months * 30;
    const batchEnd = endDay ?? Math.min(startDay + 20, totalDays); // 預設每批 21 天

    // 生成指定範圍的單字
    const BATCH_SIZE = 7; // 每次 AI 呼叫生成 7 天
    const wordsByDay: Record<number, string[]> = {};
    const currentAllWords = [...allWords];

    for (let s = startDay; s <= batchEnd; s += BATCH_SIZE) {
      const e = Math.min(s + BATCH_SIZE - 1, batchEnd);
      // 每批之間等待 5 秒，避免觸發速率限制
      if (s > startDay) await new Promise(r => setTimeout(r, 5000));
      const batch = await generateWordBatch(s, e, currentAllWords);
      for (const [day, words] of Object.entries(batch)) {
        wordsByDay[Number(day)] = words as string[];
        currentAllWords.push(...(words as string[]));
      }
    }

    // 第一批也要生成課程大綱
    let schedule = null;
    if (startDay === 1) {
      const totalWeeks = Math.ceil(totalDays / 7);
      const schedulePrompt = `請為${userName}的${months}個月JLPT N3學習計畫生成課程大綱。
總天數：${totalDays}天，共${totalWeeks}週。

重要規定：所有階段的週數加總必須等於${totalWeeks}週，不可多也不可少。

只回傳JSON：
{
  "overview": "課程說明（100字以內）",
  "phases": [
    {"name": "階段名稱", "weeks": 週數（數字）, "focus": "該階段學習重點"}
  ],
  "totalDays": ${totalDays},
  "totalWeeks": ${totalWeeks}
}`;
      let schedResult;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          schedResult = await model.generateContent(schedulePrompt);
          break;
        } catch (err: unknown) {
          if (String(err).includes("503") && attempt < 3) {
            await new Promise(r => setTimeout(r, attempt * 2000));
          } else throw err;
        }
      }
      try {
        const schedText = schedResult!.response.text().replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        schedule = JSON.parse(schedText);
      } catch {
        schedule = { overview: `${userName} 的 ${months} 個月 N3 特訓計畫`, totalDays };
      }
    }

    // 嘗試存到 Google Drive（用 OAuth accessToken）
    let fileId = null;
    try {
      const { getServerSession } = await import("next-auth");
      const { authOptions } = await import("@/lib/auth");
      const { writeDriveFile } = await import("@/lib/drive");
      const session = await getServerSession(authOptions);
      if (session?.accessToken) {
        // 存單字清單（合併到同一個檔案方便管理）
        const wlFile = `course_${userName}_words_${startDay}_${batchEnd}.json`;
        await writeDriveFile(session.accessToken, wlFile, {
          userName, startDay, endDay: batchEnd, wordsByDay, generatedAt: new Date().toISOString()
        });
        fileId = wlFile;
        // 第一批不再寫 learning_plan.json（已改由 page.tsx 寫入 course_{userName}.json）
        console.log(`[Drive] Saved course_${userName}_words_${startDay}_${batchEnd}.json`);
      }
    } catch (err) {
      console.warn("Drive 儲存失敗，跳過：", err);
    }

    return NextResponse.json({
      success: true,
      schedule,
      wordsByDay,
      generatedUntil: batchEnd,
      totalDays,
      fileId,
      allWords: currentAllWords, // 回傳給下一批使用
    });
  } catch (error) {
    console.error("generate-schedule error:", error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
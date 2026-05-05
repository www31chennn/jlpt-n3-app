import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite-preview" });

export async function POST(req: NextRequest) {
  try {
    const { userName, months, dayStart, dayEnd, wordsData, grammarData } = await req.json();
    const cycleNumber = Math.ceil(dayEnd / 7);
    const level = dayEnd <= 30 ? "N3高頻核心詞" : dayEnd <= 60 ? "N3中頻實用詞" : "N3進階慣用詞";

    // 整理單字清單
    const allWords: string[] = [];
    if (wordsData) {
      for (const day of Object.values(wordsData) as string[][]) {
        allWords.push(...day);
      }
    }

    // 整理文法清單
    const allGrammar: string[] = [];
    if (grammarData) {
      for (const dayContent of Object.values(grammarData) as { grammarPoints?: { pattern: string }[] }[]) {
        if (dayContent?.grammarPoints) {
          for (const gp of dayContent.grammarPoints) {
            if (gp.pattern && !allGrammar.includes(gp.pattern)) {
              allGrammar.push(gp.pattern);
            }
          }
        }
      }
    }

    // 把單字列成編號清單，讓 AI 更清楚範圍
    const wordList = allWords.length > 0
      ? `本週期學過的 ${allWords.length} 個單字（出題只能用這些，不能用其他單字）：\n${allWords.map((w, i) => `${i+1}. ${w}`).join('\n')}`
      : `程度：${level}`;

    const grammarList = allGrammar.length > 0
      ? `本週期學過的文法句型（只能從這些出題）：\n${allGrammar.map((g, i) => `${i+1}. ${g}`).join('\n')}`
      : "";

    const prompt = `你是JLPT N3考試出題老師。
請為學習者${userName}生成第${dayStart}天到第${dayEnd}天的週期測驗，共30題。

【嚴格規定】出題只能使用下列清單中的單字，絕對禁止出現清單以外的任何單字：

${wordList}

${grammarList}

出題要求：
- 所有題目和選項中出現的單字，必須全部在上方清單中
- 干擾選項也只能用同週期學過的其他單字，不可自創
- 30題分配如下，題型要符合真實JLPT N3考試風格，type 欄位必須對應如下：
  * 8題 type="reading"：「読み方」，漢字選正確讀音，題目格式：「○○」の読み方は？
  * 8題 type="meaning"：「意味」，選正確中文意思，題目格式：「○○」の意味は？
  * 7題 type="fill"：「文脈」，句子中有空格___，選填最合適的單字，題目格式：○○___○○。
  * 5題 type="grammar"：「文法」，選正確文法句型或助詞
  * 2題 type="usage"：「用法」，選出哪個句子用法正確
  * 注意：「意味は？」的題目必須用 type="meaning"，不可用 type="fill"
- 解析必須同時包含日文和繁體中文說明，格式：「日文說明。
中文說明：...」
- 解析要說明為何正確，以及為何其他選項錯誤

只回傳JSON：
{
  "cycleNumber": ${cycleNumber},
  "daysReviewed": [${Array.from({length: dayEnd - dayStart + 1}, (_, i) => dayStart + i).join(",")}],
  "reviewWords": ${JSON.stringify(allWords.slice(0, 15))},
  "questions": [
    {
      "id": 1,
      "type": "vocab",
      "question": "題目",
      "options": ["A", "B", "C", "D"],
      "correctIndex": 0,
      "explanation": "詳細解析（說明正確答案和為何其他選項錯誤）",
      "relatedWord": "相關單字"
    }
  ]
}

請生成全部30題，涵蓋所有學過的單字和文法。`;

    let result;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        result = await model.generateContent(prompt);
        break;
      } catch (err: unknown) {
        const msg = String(err);
        const isRetryable = msg.includes("503") || msg.includes("429");
        if (isRetryable && attempt < 2) {
          await new Promise(r => setTimeout(r, 2000));
        } else {
          throw err;
        }
      }
    }
    if (!result) throw new Error("All retries failed");

    const rawText = result.response.text();
    let quiz;
    try {
      const cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      quiz = JSON.parse(cleaned);
    } catch {
      quiz = {
        cycleNumber,
        daysReviewed: Array.from({ length: dayEnd - dayStart + 1 }, (_, i) => dayStart + i),
        reviewWords: allWords.slice(0, 10),
        questions: [{
          id: 1, type: "vocab",
          question: "生成失敗，請重新載入頁面。",
          options: ["重新載入", "", "", ""],
          correctIndex: 0,
          explanation: "請重新載入頁面再試一次。",
          relatedWord: ""
        }]
      };
    }

    return NextResponse.json({ quiz });
  } catch (error) {
    console.error("Error generating quiz:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
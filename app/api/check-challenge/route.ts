import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite-preview" });

export async function POST(req: NextRequest) {
  try {
    const { challenge, answer, day, theme } = await req.json();

    const prompt = `你是JLPT N3日語教師，正在批改學生的今日挑戰作業。

今日主題：${theme}
今日挑戰題目：${challenge}
學生的回答：${answer}

請批改這個回答，以JSON格式回應（只回傳純JSON）：
{
  "correct": true或false（整體來說是否合適、語法正確）,
  "comment": "用繁體中文說明：指出優點、錯誤原因、改進建議（100字以內，親切鼓勵的語氣）",
  "correction": "若有錯誤，給出修正後的日文句子（若正確則為null）"
}

評分標準：
- 語法是否正確
- 是否有使用今日學習的詞彙或文法
- 句子是否自然、符合日語使用習慣
- 有小錯誤但意思正確可以給 correct: true，但要在 comment 指出`;

    let result;
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        result = await model.generateContent(prompt);
        break;
      } catch (err: unknown) {
        const msg = String(err);
        const isRetryable = msg.includes("503") || msg.includes("429");
        if (isRetryable && attempt < 5) {
          await new Promise(r => setTimeout(r, attempt * 3000));
        } else {
          throw err;
        }
      }
    }
    if (!result) throw new Error("All retries failed");
    const rawText = result.response.text();
    let feedback;
    try {
      const cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      feedback = JSON.parse(cleaned);
    } catch {
      feedback = { correct: false, comment: "無法解析回應，請再試一次。", correction: null };
    }

    return NextResponse.json({ feedback });
  } catch (error) {
    console.error("check-challenge error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();
    if (!text) return NextResponse.json({ error: "No text" }, { status: 400 });

    const apiKey = process.env.GEMINI_API_KEY;

    // 在 prompt 加上語速指令 — Gemini TTS 支援自然語言控制
    const spokenPrompt = `請用緩慢、清晰、標準的日語語調朗讀以下內容，每個字都要發音清楚：${text}`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: spokenPrompt }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: "Kore" },
              },
            },
          },
        }),
      }
    );

    if (!res.ok) {
      const err = await res.json();
      console.error("TTS error:", err);
      return NextResponse.json({ error: "TTS failed", detail: err }, { status: 500 });
    }

    const data = await res.json();
    const audioData = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    const mimeType = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.mimeType ?? "audio/wav";

    if (!audioData) {
      return NextResponse.json({ error: "No audio data returned" }, { status: 500 });
    }

    // 設定快取 header — 相同請求瀏覽器直接用快取
    return new NextResponse(JSON.stringify({ audio: audioData, mimeType }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=86400", // 快取 24 小時
      },
    });
  } catch (error) {
    console.error("TTS route error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

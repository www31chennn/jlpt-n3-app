import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

export async function POST(req: NextRequest) {
  try {
    const { serviceAccountJson } = await req.json();
    let creds;
    try {
      creds = typeof serviceAccountJson === "string" ? JSON.parse(serviceAccountJson) : serviceAccountJson;
    } catch {
      return NextResponse.json({ success: false, error: "JSON 格式錯誤，請確認貼上的內容正確。" });
    }

    // 驗證必要欄位
    const required = ["project_id", "private_key", "client_email"];
    for (const field of required) {
      if (!creds[field]) return NextResponse.json({ success: false, error: `缺少欄位：${field}` });
    }

    // 測試連線
    const auth = new google.auth.GoogleAuth({
      credentials: {
        type: "service_account",
        project_id: creds.project_id,
        private_key_id: creds.private_key_id,
        private_key: creds.private_key.replace(/\\n/g, "\n"),
        client_email: creds.client_email,
        client_id: creds.client_id,
      },
      scopes: ["https://www.googleapis.com/auth/drive.file"],
    });

    const drive = google.drive({ version: "v3", auth });
    await drive.files.list({ pageSize: 1 }); // 測試是否有權限

    // 回傳需要設定的環境變數值（讓前端存到 localStorage 當作臨時設定）
    return NextResponse.json({
      success: true,
      config: {
        GOOGLE_PROJECT_ID: creds.project_id,
        GOOGLE_PRIVATE_KEY_ID: creds.private_key_id,
        GOOGLE_PRIVATE_KEY: creds.private_key,
        GOOGLE_CLIENT_EMAIL: creds.client_email,
        GOOGLE_CLIENT_ID: creds.client_id,
      }
    });
  } catch (error) {
    console.error("setup-drive error:", error);
    return NextResponse.json({ success: false, error: "連線失敗，請確認 Service Account 有 Google Drive API 權限。" });
  }
}

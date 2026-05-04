import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { google } from "googleapis";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { courseName } = await req.json();
  if (!courseName) {
    return NextResponse.json({ error: "Missing courseName" }, { status: 400 });
  }

  try {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: session.accessToken });
    const drive = google.drive({ version: "v3", auth });

    // 找到 JLPT_N3_Learning 資料夾
    const folderRes = await drive.files.list({
      q: `name='JLPT_N3_Learning' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: "files(id)",
      spaces: "drive",
    });

    const folderId = folderRes.data.files?.[0]?.id;
    if (!folderId) {
      return NextResponse.json({ ok: true, deleted: 0 });
    }

    // 找所有屬於這個課程的檔案（以課程名稱開頭）
    const filesRes = await drive.files.list({
      q: `'${folderId}' in parents and name contains 'course_${courseName}' and trashed=false`,
      fields: "files(id, name)",
      spaces: "drive",
    });

    const files = filesRes.data.files ?? [];
    let deleted = 0;

    for (const file of files) {
      try {
        await drive.files.delete({ fileId: file.id! });
        console.log(`[Drive] Deleted: ${file.name}`);
        deleted++;
      } catch (e) {
        console.warn(`[Drive] Failed to delete ${file.name}:`, e);
      }
    }

    return NextResponse.json({ ok: true, deleted });
  } catch (e) {
    console.error("delete-course-files error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
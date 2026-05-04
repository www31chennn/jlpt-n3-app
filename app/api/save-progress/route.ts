import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { writeDriveFile } from "@/lib/drive";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userData, completedDay, quizResult } = body;

    // 只存需要的欄位，不把 localStorage 的臨時欄位存進去
    const saveData = {
      userName: userData.userName,
      months: userData.months,
      totalDays: userData.totalDays ?? userData.months * 30,
      startDate: userData.startDate,
      currentDay: userData.currentDay,
      completedDays: [
        ...(userData.completedDays || []),
        ...(completedDay ? [completedDay] : []),
      ],
      quizResults: [
        ...(userData.quizResults || []),
        ...(quizResult ? [{ ...quizResult, date: new Date().toISOString() }] : []),
      ],
      lastUpdated: new Date().toISOString(),
      // 保留 schedule（若有）
      ...(userData.schedule ? { schedule: userData.schedule } : {}),
    };

    // 去除重複的 completedDays
    saveData.completedDays = [...new Set(saveData.completedDays)];

    // 存到 Google Drive
    const session = await getServerSession(authOptions);
    if (session?.accessToken) {
      try {
        await writeDriveFile(session.accessToken, "learning_plan.json", saveData);
      } catch (err) {
        console.warn("Drive save failed:", err);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("save-progress error:", error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { userName } = await req.json();

    if (!process.env.GOOGLE_CLIENT_EMAIL) {
      return NextResponse.json({ success: false, data: null, reason: "Drive not configured" });
    }

    const { loadUserData } = await import("@/lib/googleDrive");
    const data = await loadUserData(`${userName}_learning_plan.json`);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("load-progress error:", error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

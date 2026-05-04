"use client";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function SettingsPage() {
  const { data: session } = useSession();
  const router = useRouter();

  return (
    <div style={{ minHeight: "100vh", background: "#f8f4ed", fontFamily: "'Noto Sans JP', 'Noto Sans TC', sans-serif" }}>
      <div style={{ background: "white", borderBottom: "1px solid rgba(26,18,9,0.08)", padding: "14px 24px", display: "flex", alignItems: "center", gap: 16, position: "sticky", top: 0, zIndex: 50 }}>
        <button onClick={() => router.push("/dashboard")} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#1a1209" }}>←</button>
        <div style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 16, fontWeight: 700, color: "#1a1209" }}>帳號設定</div>
      </div>

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "36px 20px" }}>
        {session ? (
          <div style={{ background: "white", border: "1px solid rgba(26,18,9,0.08)", borderRadius: 4, overflow: "hidden", boxShadow: "0 2px 12px rgba(26,18,9,0.06)" }}>
            <div style={{ height: 3, background: "linear-gradient(90deg, #2e7d4f, #c9a84c)" }} />
            <div style={{ padding: "28px 32px" }}>
              <div style={{ fontSize: 12, color: "#2e7d4f", fontWeight: 600, letterSpacing: "0.1em", marginBottom: 16 }}>✓ 已登入 Google 帳號</div>
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
                {session.user?.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={session.user.image} alt="avatar" style={{ width: 48, height: 48, borderRadius: "50%", border: "2px solid rgba(46,125,79,0.2)" }} />
                )}
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: "#1a1209" }}>{session.user?.name}</div>
                  <div style={{ fontSize: 13, color: "rgba(26,18,9,0.5)" }}>{session.user?.email}</div>
                </div>
              </div>
              <div style={{ padding: "14px 18px", background: "rgba(46,125,79,0.05)", borderRadius: 4, marginBottom: 24, fontSize: 13, color: "#2e7d4f", lineHeight: 1.7 }}>
                ☁ 學習資料自動同步到你的 Google Drive<br />
                <span style={{ color: "rgba(26,18,9,0.45)" }}>資料夾名稱：JLPT_N3_Learning</span>
              </div>
              <button onClick={() => signOut({ callbackUrl: "/login" })} style={{ padding: "10px 24px", border: "1px solid rgba(192,57,43,0.3)", borderRadius: 2, background: "transparent", color: "#c0392b", fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                登出 Google 帳號
              </button>
            </div>
          </div>
        ) : (
          <div style={{ background: "white", border: "1px solid rgba(26,18,9,0.08)", borderRadius: 4, padding: "28px 32px", textAlign: "center" }}>
            <div style={{ fontSize: 14, color: "rgba(26,18,9,0.55)", marginBottom: 16 }}>尚未登入 Google 帳號</div>
            <button onClick={() => router.push("/login")} style={{ padding: "11px 28px", background: "#c0392b", color: "white", border: "none", borderRadius: 2, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
              前往登入 →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

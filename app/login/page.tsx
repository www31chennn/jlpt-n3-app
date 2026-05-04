"use client";
import { signIn } from "next-auth/react";

export default function LoginPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#f8f4ed", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px", fontFamily: "'Noto Sans JP', 'Noto Sans TC', sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 400, textAlign: "center" }}>

        {/* Logo */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ width: 72, height: 72, border: "3px solid #c0392b", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Noto Serif JP', serif", fontSize: 26, fontWeight: 900, color: "#c0392b", transform: "rotate(-8deg)", margin: "0 auto 20px" }}>
            N3
          </div>
          <h1 style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 28, fontWeight: 700, color: "#1a1209", marginBottom: 8 }}>日本語N3特訓計畫</h1>
          <p style={{ fontSize: 14, color: "rgba(26,18,9,0.5)" }}>零基礎 → JLPT N3</p>
        </div>

        {/* Features */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 36, textAlign: "left" }}>
          {[
            ["📖", "每日8個N3核心單字"],
            ["☁️", "學習進度同步到 Google Drive"],
            ["🎯", "每週智能測驗與批改"],
            ["🔊", "日語發音即時播放"],
          ].map(([icon, text]) => (
            <div key={text} style={{ display: "flex", alignItems: "center", gap: 12, background: "white", borderRadius: 4, padding: "12px 16px", border: "1px solid rgba(26,18,9,0.08)", boxShadow: "0 1px 4px rgba(26,18,9,0.04)" }}>
              <span style={{ fontSize: 20 }}>{icon}</span>
              <span style={{ fontSize: 14, color: "#1a1209" }}>{text}</span>
            </div>
          ))}
        </div>

        {/* Login button */}
        <button
          onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 12, background: "white", border: "1.5px solid rgba(26,18,9,0.15)", borderRadius: 4, padding: "14px 24px", fontSize: 15, fontWeight: 600, color: "#1a1209", cursor: "pointer", boxShadow: "0 2px 8px rgba(26,18,9,0.08)", transition: "all 0.2s", fontFamily: "inherit" }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = "#c0392b")}
          onMouseLeave={e => (e.currentTarget.style.borderColor = "rgba(26,18,9,0.15)")}
        >
          <svg viewBox="0 0 24 24" width="20" height="20">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          使用 Google 帳號登入
        </button>

        <p style={{ fontSize: 11, color: "rgba(26,18,9,0.35)", marginTop: 16, lineHeight: 1.8 }}>
          登入即授權 App 讀寫你 Google Drive 中<br />
          「JLPT_N3_Learning」資料夾的資料
        </p>
      </div>
    </div>
  );
}

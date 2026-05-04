"use client";
import { useEffect, useState, useRef } from "react";
import { usePathname } from "next/navigation";

export default function PageTransition() {
  const pathname = usePathname();
  const [loading, setLoading] = useState(false);
  const prevPath = useRef<string>("");

  useEffect(() => {
    const prev = prevPath.current;
    prevPath.current = pathname;

    // 只有從 study/quiz 離開時才顯示轉圈（不是進入這些頁面）
    const leavingStudyOrQuiz = prev.startsWith("/study") || prev.startsWith("/quiz");
    if (!leavingStudyOrQuiz) return;

    setLoading(true);
    const t = setTimeout(() => setLoading(false), 400);
    return () => clearTimeout(t);
  }, [pathname]);

  if (!loading) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(248,244,237,0.85)",
      display: "flex", alignItems: "center", justifyContent: "center",
      backdropFilter: "blur(2px)",
    }}>
      <div style={{ textAlign: "center" }}>
        <div style={{
          width: 40, height: 40, border: "3px solid rgba(192,57,43,0.15)",
          borderTop: "3px solid #c0392b", borderRadius: "50%",
          animation: "spin 0.7s linear infinite", margin: "0 auto 12px"
        }} />
        <div style={{ fontSize: 13, color: "rgba(26,18,9,0.45)", fontFamily: "'Noto Sans JP', sans-serif" }}>載入中...</div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
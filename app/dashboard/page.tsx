"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";

type UserData = {
  userName: string;
  months: number;
  startDate: string;
  currentDay: number;
  fileId?: string;
  completedDays?: number[];
};

const WEEKLY_THEMES = [
  "日常問候與自我介紹", "家庭與人際關係", "時間與日期", "飲食與餐廳",
  "交通與方向", "購物與金錢", "天氣與季節", "身體與健康",
  "工作與職業", "趣味與嗜好", "旅行與觀光", "學校與教育",
  "情感與感受", "自然與環境", "城市與設施", "文化與傳統",
  "科技與通訊", "媒體與娛樂", "社會與新聞", "動作與行為",
  "形容與描述", "比較與對比", "原因與結果", "計畫與目標",
  "問題與解決", "意見與建議", "感謝與道歉", "願望與夢想",
  "過去與回憶", "未來與變化", "社交禮儀", "日本文化深度",
  "N3綜合複習一", "N3綜合複習二", "N3綜合複習三",
];

function getTheme(day: number) {
  return WEEKLY_THEMES[Math.floor((day - 1) / 7) % WEEKLY_THEMES.length];
}

function getDayStatus(day: number, currentDay: number, completedDays: number[]) {
  if (completedDays.includes(day)) return "done";
  if (day === currentDay) return "today";
  if (day < currentDay) return "missed";
  return "future";
}

export default function Dashboard() {
  const router = useRouter();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [activeMonth, setActiveMonth] = useState(1);
  const { data: session, status } = useSession();
  const isDriveConfigured = !!session?.accessToken;

  // 登入後從 Drive 同步進度
  useEffect(() => {
    if (!session?.accessToken) return;
    const syncFromDrive = async () => {
      try {
        const res = await fetch(`/api/drive?file=learning_plan.json`);
        const { data } = await res.json();
        if (data) {
          const local = localStorage.getItem("jlpt_user");
          const localData = local ? JSON.parse(local) : null;
          // Drive 的進度比較新才更新
          if (!localData || data.currentDay > localData.currentDay) {
            localStorage.setItem("jlpt_user", JSON.stringify(data));
            setUserData(data);
          }
        }
      } catch (e) {
        console.warn("Drive sync failed:", e);
      }
    };
    syncFromDrive();
  }, [session]);

  const loadUserData = async (setMonth = false) => {
    try {
      const activeCourse = localStorage.getItem("jlpt_active_course");
      if (!activeCourse) { router.push("/"); return; }
      const file = `course_${activeCourse}.json`;
      const res = await fetch(`/api/drive?file=${encodeURIComponent(file)}`);
      const { data } = await res.json();
      if (data?.userName) {
        setUserData(data);
        // 只在初次載入時設定 activeMonth，避免覆蓋使用者的選擇
        if (setMonth) setActiveMonth(Math.ceil(data.currentDay / 30));
      } else {
        router.push("/");
      }
    } catch {
      router.push("/");
    }
  };

  useEffect(() => {
    if (!session) return;
    loadUserData(true);  // 初次載入設定月份
    const onFocus = () => loadUserData(false);  // focus 時只更新資料，不改月份
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [session, router]);

    if (!userData) return null;

  const totalDays = userData.months * 30;
  const completedDays = userData.completedDays ?? [];
  const progress = Math.round((completedDays.length / totalDays) * 100);
  const monthStart = (activeMonth - 1) * 30 + 1;
  const monthEnd = Math.min(activeMonth * 30, totalDays);
  // 把跨月的週期也納入顯示範圍（往前延伸到週期起點）
  const displayStart = Math.floor((monthStart - 1) / 7) * 7 + 1;
  const displayEnd = Math.min(Math.ceil(monthEnd / 7) * 7, totalDays);
  // 用 displayStart/displayEnd 確保跨月週期完整顯示
  const daysToShow = Array.from({ length: displayEnd - displayStart + 1 }, (_, i) => displayStart + i);

  // 分成每7天一組（週期），以第1天為基準對齊
  const cycles: number[][] = [];
  for (let i = 0; i < daysToShow.length; i += 7) {
    cycles.push(daysToShow.slice(i, i + 7));
  }

  const goToDay = (day: number) => {
    if (day === userData.currentDay) {
      router.push("/study");
    } else {
      // 直接把 day 放 URL，不靠 localStorage 中轉
      router.push(`/study?preview=1&day=${day}`);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f8f4ed", fontFamily: "'Noto Sans JP', 'Noto Sans TC', sans-serif" }}>
      {/* Nav */}
      <div style={{ background: "white", borderBottom: "1px solid rgba(26,18,9,0.08)", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 50 }}>
        <button onClick={() => router.push("/")} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#1a1209" }}>←</button>
        <div style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 16, fontWeight: 700, color: "#1a1209" }}>學習儀表板</div>
        {session ? (
          <button onClick={() => router.push("/settings")} style={{ fontSize: 12, color: "rgba(26,18,9,0.45)", background: "none", border: "1px solid rgba(26,18,9,0.12)", borderRadius: 2, padding: "5px 10px", cursor: "pointer", fontFamily: "inherit" }}>
            設定
          </button>
        ) : (
          <div style={{ width: 32 }} />
        )}
      </div>

      {/* Drive 未設定提示條 */}
      {status !== "loading" && !isDriveConfigured && (
        <div style={{ background: "#fffbe6", borderBottom: "1px solid rgba(201,168,76,0.4)", padding: "9px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, position: "sticky", top: 57, zIndex: 49 }}>
          <div style={{ fontSize: 13, color: "#7a5f00", display: "flex", alignItems: "center", gap: 8 }}>
            <span>⚠</span>
            <span>資料只存在此瀏覽器，清除或換裝置將遺失。登入 Google 即可自動備份。</span>
          </div>
          <button onClick={() => router.push("/login")} style={{ padding: "5px 16px", background: "#c9a84c", color: "white", border: "none", borderRadius: 2, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit", flexShrink: 0 }}>
            Google 登入 →
          </button>
        </div>
      )}

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "28px 20px" }}>

        {/* User info + progress */}
        <div style={{ background: "white", borderRadius: 4, overflow: "hidden", marginBottom: 20, boxShadow: "0 2px 12px rgba(26,18,9,0.06)" }}>
          <div style={{ height: 3, background: "linear-gradient(90deg, #c0392b, #c9a84c)" }} />
          <div style={{ padding: "24px 28px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 12, color: "#c0392b", fontWeight: 600, letterSpacing: "0.1em", marginBottom: 4 }}>學習者</div>
                <div style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 22, fontWeight: 700, color: "#1a1209" }}>{userData.userName}</div>
                <div style={{ fontSize: 13, color: "rgba(26,18,9,0.45)", marginTop: 4 }}>{userData.months}個月特訓 · 目標 JLPT N3</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 36, fontWeight: 900, color: "#c0392b", lineHeight: 1 }}>{progress}%</div>
                <div style={{ fontSize: 12, color: "rgba(26,18,9,0.4)", marginTop: 4 }}>整體進度</div>
              </div>
            </div>

            {/* Progress bar */}
            <div style={{ background: "#f0ebe2", borderRadius: 4, height: 8, marginBottom: 12, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${progress}%`, background: "linear-gradient(90deg, #c0392b, #c9a84c)", borderRadius: 4, transition: "width 0.5s" }} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              {[
                ["當前", `第 ${userData.currentDay} 天`],
                ["剩餘", `${totalDays - userData.currentDay + 1} 天`],
                ["已完成", `${completedDays.length} 天`],
                ["詞彙量", `${completedDays.length * 8}+ 個`],
              ].map(([label, value]) => (
                <div key={label} style={{ textAlign: "center", padding: "10px", background: "#f8f4ed", borderRadius: 4 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1209", fontFamily: "'Noto Serif JP', serif" }}>{value}</div>
                  <div style={{ fontSize: 11, color: "rgba(26,18,9,0.4)", marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Today's entry */}
        <button onClick={() => router.push("/study")} style={{ width: "100%", background: "#c0392b", color: "white", border: "none", borderRadius: 4, padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", marginBottom: 24, fontFamily: "inherit" }}>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>今日學習 · {getTheme(userData.currentDay)}</div>
            <div style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 18, fontWeight: 700 }}>第 {userData.currentDay} 天 開始學習</div>
          </div>
          <div style={{ fontSize: 28 }}>→</div>
        </button>

        {/* Month tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20, overflowX: "auto", paddingBottom: 4 }}>
          {Array.from({ length: userData.months }, (_, i) => i + 1).map(m => (
            <button key={m} onClick={() => setActiveMonth(m)} style={{ padding: "8px 18px", borderRadius: 20, border: activeMonth === m ? "2px solid #c0392b" : "1.5px solid rgba(26,18,9,0.12)", background: activeMonth === m ? "rgba(192,57,43,0.06)" : "white", color: activeMonth === m ? "#c0392b" : "#1a1209", fontSize: 13, fontWeight: activeMonth === m ? 600 : 400, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit", flexShrink: 0 }}>
              第 {m} 個月
            </button>
          ))}
        </div>

        {/* Calendar grid by cycle */}
        <div style={{ marginBottom: 24 }}>
          {cycles.map((cycle, ci) => {
            const cycleNum = Math.floor((cycle[0] - 1) / 7) + 1;
            const isQuizCycle = cycle.length === 7;
            const theme = getTheme(cycle[0]);
            return (
              <div key={ci} style={{ marginBottom: 16 }}>
                {/* Cycle header */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: "#c0392b", fontWeight: 600, letterSpacing: "0.1em" }}>週期 {cycleNum}</div>
                  <div style={{ fontSize: 12, color: "rgba(26,18,9,0.45)" }}>· {theme}</div>
                  {isQuizCycle && (() => {
                    // 檢查這個週期的天數是否都完成
                    const cycleStart = (cycleNum - 1) * 7 + 1;
                    const cycleEnd = cycleNum * 7;
                    const allDone = Array.from({ length: cycleEnd - cycleStart + 1 }, (_, i) => cycleStart + i)
                      .every(d => completedDays.includes(d));
                    return allDone ? (
                      <button
                        onClick={() => router.push(`/quiz?cycle=${cycleNum}`)}
                        style={{ fontSize: 11, background: "rgba(192,57,43,0.08)", color: "#c0392b", padding: "3px 10px", borderRadius: 20, marginLeft: "auto", border: "1px solid rgba(192,57,43,0.2)", cursor: "pointer", fontFamily: "inherit" }}
                      >
                        🎯 週期測驗 #{cycleNum}
                      </button>
                    ) : (
                      <div
                        title={`請先完成第 ${cycleStart}-${cycleEnd} 天的學習再來測驗`}
                        style={{ fontSize: 11, background: "rgba(26,18,9,0.05)", color: "rgba(26,18,9,0.3)", padding: "3px 10px", borderRadius: 20, marginLeft: "auto", border: "1px solid rgba(26,18,9,0.1)", cursor: "not-allowed", fontFamily: "inherit" }}
                      >
                        🔒 週期測驗 #{cycleNum}
                      </div>
                    );
                  })()}
                </div>

                {/* Days grid */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
                  {cycle.map(day => {
                    const status = getDayStatus(day, userData.currentDay, completedDays);
                    const isToday = status === "today";
                    const isDone = status === "done";
                    const isFuture = status === "future";

                    return (
                      <button key={day} onClick={() => goToDay(day)} style={{
                        padding: "10px 4px",
                        borderRadius: 4,
                        border: isToday ? "2px solid #c0392b" : isDone ? "1.5px solid rgba(46,125,79,0.3)" : isFuture ? "1.5px dashed rgba(26,18,9,0.1)" : "1.5px solid rgba(26,18,9,0.08)",
                        background: isToday ? "rgba(192,57,43,0.05)" : isDone ? "rgba(46,125,79,0.06)" : "white",
                        cursor: "pointer",
                        textAlign: "center",
                        transition: "all 0.15s",
                        fontFamily: "inherit",
                        opacity: isFuture ? 0.55 : 1,
                      }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: isToday ? "#c0392b" : isDone ? "#2e7d4f" : "rgba(26,18,9,0.5)", fontFamily: "'Noto Serif JP', serif", lineHeight: 1, marginBottom: 3 }}>
                          {isDone ? "✓" : day}
                        </div>
                        <div style={{ fontSize: 9, color: isToday ? "#c0392b" : "rgba(26,18,9,0.35)", lineHeight: 1.2 }}>
                          {isToday ? "今天" : isDone ? `第${day}天` : `第${day}天`}
                        </div>
                      </button>
                    );
                  })}
                  {/* 填滿7格 */}
                  {Array.from({ length: 7 - cycle.length }, (_, i) => (
                    <div key={`empty-${i}`} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, color: "rgba(26,18,9,0.45)" }}>
          {[
            { color: "#c0392b", label: "今天" },
            { color: "#2e7d4f", label: "已完成" },
            { color: "rgba(26,18,9,0.3)", label: "未完成" },
            { color: "rgba(26,18,9,0.2)", label: "未來" },
          ].map(({ color, label }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
              {label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
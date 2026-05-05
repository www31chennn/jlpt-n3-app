"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

const MONTH_OPTIONS = [3, 6, 9, 12];
const INITIAL_DAYS = 21;

type CourseData = {
  userName: string;
  months: number;
  totalDays: number;
  startDate: string;
  currentDay: number;
  completedDays: number[];
  quizResults: unknown[];
  schedule: unknown;
  generatedUntil: number;
};

export default function Home() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [selectedMonths, setSelectedMonths] = useState<number | null>(null);
  const [userName, setUserName] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");
  const [courses, setCourses] = useState<CourseData[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (status === "loading") return;
    if (!session) { router.push("/login"); return; }
    loadCourses();
  }, [session, status]);

  const loadCourses = async () => {
    try {
      const res = await fetch("/api/drive?file=courses_index.json");
      const { data } = await res.json();
      if (data?.courses) {
        // 從每個課程的獨立檔案讀最新進度
        const updated = await Promise.all(
          data.courses.map(async (c: CourseData) => {
            try {
              const r = await fetch(`/api/drive?file=${encodeURIComponent(`course_${c.userName}.json`)}`);
              const { data: latest } = await r.json();
              return latest?.userName ? latest : c;
            } catch {
              return c;
            }
          })
        );
        setCourses(updated);
      }
    } catch {}
  };

  const handleStart = async () => {
    if (!selectedMonths || !userName.trim()) return;

    // 檢查是否有同名課程
    const existing = courses.find(c => c.userName === userName.trim());
    if (existing) {
      if (!confirm(`「${userName.trim()}」已有進行中的課程（第 ${existing.currentDay} 天），確定要建立新課程嗎？舊課程不會被刪除，可以隨時切換。`)) return;
    }

    setLoading(true);
    setProgress(0);
    setProgressMsg("準備生成課表...");

    try {
      const totalDays = selectedMonths * 30;
      let allWords: string[] = [];
      let wordsByDay: Record<number, string[]> = {};

      setProgressMsg(`生成前 ${INITIAL_DAYS} 天單字清單...`);
      setProgress(10);

      let fakeProgress = 10;
      const progressTimer = setInterval(() => {
        fakeProgress = Math.min(fakeProgress + 0.6, 85);
        setProgress(Math.round(fakeProgress));
      }, 800);

      let firstData;
      try {
        const firstRes = await fetch("/api/generate-schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ months: selectedMonths, userName: userName.trim(), startDay: 1, endDay: INITIAL_DAYS, allWords: [] }),
        });
        firstData = await firstRes.json();
      } finally {
        clearInterval(progressTimer);
      }
      if (!firstData.success) throw new Error(firstData.error);

      wordsByDay = { ...firstData.wordsByDay };
      allWords = firstData.allWords;

      // 存單字清單到 localStorage（以 userName 為 key）
      localStorage.setItem(`jlpt_word_list_${userName.trim()}`, JSON.stringify(wordsByDay));

      const newCourse: CourseData = {
        userName: userName.trim(),
        months: selectedMonths,
        totalDays,
        startDate: new Date().toISOString(),
        currentDay: 1,
        completedDays: [],
        quizResults: [],
        schedule: firstData.schedule ?? null,
        generatedUntil: INITIAL_DAYS,
      };

      // 更新課程索引
      const updatedCourses = [...courses.filter(c => c.userName !== userName.trim()), newCourse];
      await fetch("/api/drive?file=courses_index.json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: { courses: updatedCourses } }),
      });

      // 存個別課程檔案
      await fetch(`/api/drive?file=course_${userName.trim()}.json`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: newCourse }),
      });

      // 設定當前使用中的課程
      localStorage.setItem("jlpt_active_course", userName.trim());

      setProgress(90);
      setProgressMsg("完成！進入儀表板...");
      await new Promise(r => setTimeout(r, 400));
      router.push("/dashboard");

      if (totalDays > INITIAL_DAYS) {
        backgroundGenerate(userName.trim(), selectedMonths, INITIAL_DAYS + 1, totalDays, allWords, wordsByDay);
      }

    } catch (e) {
      console.error(e);
      alert("生成失敗，請稍後再試。");
      setLoading(false);
      setProgress(0);
    }
  };

  const switchCourse = (courseName: string) => {
    localStorage.setItem("jlpt_active_course", courseName);
    router.push("/dashboard");
  };

  const deleteCourse = async (courseName: string) => {
    setDeleting(true);
    try {
      // 1. 更新課程索引
      const updatedCourses = courses.filter(c => c.userName !== courseName);
      await fetch("/api/drive?file=courses_index.json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: { courses: updatedCourses } }),
      });

      // 2. 刪除 Drive 上該課程的所有檔案
      await fetch("/api/delete-course-files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseName }),
      }).catch(() => {});

      // 3. 清除 localStorage
      localStorage.removeItem(`jlpt_word_list_${courseName}`);
      if (localStorage.getItem("jlpt_active_course") === courseName) {
        localStorage.removeItem("jlpt_active_course");
      }
      // 清除該課程的每天內容快取
      for (let i = 1; i <= 360; i++) {
        localStorage.removeItem(`jlpt_content_day_${i}`);
        localStorage.removeItem(`jlpt_done_day_${i}`);
      }

      setCourses(updatedCourses);
      setShowDeleteConfirm(null);
    } catch (e) {
      console.error(e);
    } finally {
      setDeleting(false);
    }
  };

  async function backgroundGenerate(name: string, months: number, startDay: number, totalDays: number, allWords: string[], wordsByDay: Record<number, string[]>) {
    const BATCH = 14;
    let currentStart = startDay;
    let currentAllWords = [...allWords];
    let currentWordsByDay = { ...wordsByDay };
    while (currentStart <= totalDays) {
      const end = Math.min(currentStart + BATCH - 1, totalDays);
      try {
        const res = await fetch("/api/generate-schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ months, userName: name, startDay: currentStart, endDay: end, allWords: currentAllWords }),
        });
        const data = await res.json();
        if (data.success) {
          currentWordsByDay = { ...currentWordsByDay, ...data.wordsByDay };
          currentAllWords = data.allWords;
          localStorage.setItem(`jlpt_word_list_${name}`, JSON.stringify(currentWordsByDay));
          // 更新課程的 generatedUntil
          const planRes = await fetch(`/api/drive?file=${encodeURIComponent(`course_${name}.json`)}`);
          const { data: plan } = await planRes.json();
          if (plan) {
            await fetch(`/api/drive?file=${encodeURIComponent(`course_${name}.json`)}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ data: { ...plan, generatedUntil: end } }),
            });
          }
        }
      } catch (e) {
        console.warn(`背景生成失敗`, e);
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }
      currentStart = end + 1;
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  const totalDays = selectedMonths ? selectedMonths * 30 : 0;
  if (status === "loading") return null;

  return (
    <div style={{ minHeight: "100vh", background: "#f8f4ed", fontFamily: "'Noto Sans JP', 'Noto Sans TC', sans-serif" }}>
      <div style={{ maxWidth: 700, margin: "0 auto", padding: "60px 24px" }}>

        {/* Header */}
        {/* 右上角設定按鈕 */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
          <button onClick={() => router.push("/settings")} style={{ fontSize: 12, color: "rgba(26,18,9,0.45)", background: "none", border: "1px solid rgba(26,18,9,0.12)", borderRadius: 2, padding: "5px 12px", cursor: "pointer", fontFamily: "inherit" }}>
            ⚙ 設定
          </button>
        </div>

        <div style={{ textAlign: "center", marginBottom: 52 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
            <div style={{ width: 60, height: 60, border: "3px solid #c0392b", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Noto Serif JP', serif", fontSize: 22, fontWeight: 900, color: "#c0392b", transform: "rotate(-8deg)", opacity: 0.85 }}>N3</div>
          </div>
          <h1 style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 34, fontWeight: 700, color: "#1a1209", marginBottom: 10 }}>日本語N3特訓計畫</h1>
          <p style={{ color: "#5a4a35", fontSize: 15, fontWeight: 300 }}>零基礎 → JLPT N3 · 每日短時間 · 智能課表生成</p>
          <div style={{ width: 50, height: 2, background: "#c0392b", margin: "18px auto 0", opacity: 0.6 }} />
        </div>

        {/* 現有課程列表 */}
        {courses.length > 0 && !loading && (
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 12, color: "#c9a84c", fontWeight: 600, letterSpacing: "0.1em", marginBottom: 12 }}>✦ 進行中的課程</div>
            {courses.map(course => {
              const progress = Math.round((course.completedDays?.length || 0) / course.totalDays * 100);
              return (
                <div key={course.userName} style={{ background: "white", border: "1px solid rgba(26,18,9,0.1)", borderRadius: 4, padding: "16px 20px", marginBottom: 10, boxShadow: "0 2px 8px rgba(26,18,9,0.05)", borderLeft: "3px solid #c9a84c" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                        <div style={{ fontSize: 15, fontWeight: 600, color: "#1a1209" }}>{course.userName}</div>
                        <div style={{ fontSize: 12, color: "rgba(26,18,9,0.4)" }}>{course.months}個月 · 第 {course.currentDay} 天</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, height: 4, background: "#f0ebe2", borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${progress}%`, background: "linear-gradient(90deg, #c0392b, #c9a84c)", borderRadius: 2, transition: "width 0.5s" }} />
                        </div>
                        <div style={{ fontSize: 11, color: "rgba(26,18,9,0.4)", whiteSpace: "nowrap" }}>{progress}%</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => switchCourse(course.userName)} style={{ padding: "7px 16px", background: "#c0392b", color: "white", border: "none", borderRadius: 2, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                        繼續 →
                      </button>
                      <button onClick={() => setShowDeleteConfirm(course.userName)} style={{ padding: "7px 12px", background: "transparent", color: "rgba(26,18,9,0.4)", border: "1px solid rgba(26,18,9,0.15)", borderRadius: 2, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                        🗑
                      </button>
                    </div>
                  </div>

                  {/* 刪除確認 */}
                  {showDeleteConfirm === course.userName && (
                    <div style={{ marginTop: 12, padding: "12px 16px", background: "rgba(192,57,43,0.05)", borderRadius: 2, border: "1px solid rgba(192,57,43,0.2)" }}>
                      <div style={{ fontSize: 13, color: "#c0392b", marginBottom: 10 }}>確定刪除「{course.userName}」的課程？此操作無法復原。</div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => deleteCourse(course.userName)} disabled={deleting} style={{ padding: "6px 16px", background: "#c0392b", color: "white", border: "none", borderRadius: 2, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                          {deleting ? "刪除中..." : "確定刪除"}
                        </button>
                        <button onClick={() => setShowDeleteConfirm(null)} style={{ padding: "6px 12px", background: "transparent", color: "rgba(26,18,9,0.5)", border: "1px solid rgba(26,18,9,0.15)", borderRadius: 2, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                          取消
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ background: "white", border: "1px solid rgba(26,18,9,0.08)", borderRadius: 4, overflow: "hidden", padding: "40px", textAlign: "center", boxShadow: "0 4px 24px rgba(26,18,9,0.07)", marginBottom: 24 }}>
            <div style={{ height: 3, background: "linear-gradient(90deg, #c0392b, #c9a84c)", margin: "-40px -40px 32px -40px" }} />
            <div style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 32, color: "#c0392b", marginBottom: 16, animation: "pulse 1.5s ease infinite" }}>日</div>
            <div style={{ fontSize: 15, color: "#1a1209", fontWeight: 500, marginBottom: 8 }}>{progressMsg}</div>
            <div style={{ fontSize: 13, color: "rgba(26,18,9,0.45)", marginBottom: 24 }}>前 {INITIAL_DAYS} 天準備好後即可開始，剩餘在背景繼續生成</div>
            <div style={{ background: "#f0ebe2", borderRadius: 4, height: 8, overflow: "hidden", marginBottom: 8 }}>
              <div style={{ height: "100%", width: `${progress}%`, background: "linear-gradient(90deg, #c0392b, #c9a84c)", borderRadius: 4, transition: "width 0.5s ease" }} />
            </div>
            <div style={{ fontSize: 12, color: "rgba(26,18,9,0.4)" }}>{progress}%</div>
          </div>
        )}

        {/* 新建課程 */}
        {!loading && (
          <div style={{ background: "white", border: "1px solid rgba(26,18,9,0.08)", borderRadius: 4, overflow: "hidden", boxShadow: "0 4px 24px rgba(26,18,9,0.07)" }}>
            <div style={{ height: 3, background: "linear-gradient(90deg, #c0392b, #c9a84c)" }} />
            <div style={{ padding: "36px 40px" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1209", marginBottom: 24, fontFamily: "'Noto Serif JP', serif" }}>
                {courses.length > 0 ? "新增課程" : "開始學習"}
              </div>

              <div style={{ marginBottom: 28 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, letterSpacing: "0.15em", color: "#c0392b", textTransform: "uppercase", marginBottom: 10 }}>學習者名稱</label>
                <input type="text" value={userName} onChange={e => setUserName(e.target.value)} placeholder="例：小明（每個課程用名稱區分）" style={{ width: "100%", padding: "12px 16px", border: "1.5px solid rgba(26,18,9,0.15)", borderRadius: 2, fontFamily: "inherit", fontSize: 16, color: "#1a1209", background: "#f8f4ed", outline: "none", boxSizing: "border-box" }} onFocus={e => e.target.style.borderColor = "#c0392b"} onBlur={e => e.target.style.borderColor = "rgba(26,18,9,0.15)"} />
              </div>

              <div style={{ marginBottom: 28 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, letterSpacing: "0.15em", color: "#c0392b", textTransform: "uppercase", marginBottom: 10 }}>特訓期程</label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                  {MONTH_OPTIONS.map(m => {
                    const isSelected = selectedMonths === m;
                    const labels = ["高強度", "標準", "舒適", "悠閒"];
                    const colors = ["#c0392b", "#c9a84c", "#2e7d4f", "#8fa8b8"];
                    const idx = MONTH_OPTIONS.indexOf(m);
                    return (
                      <button key={m} onClick={() => setSelectedMonths(m)} style={{ padding: "18px 10px", border: isSelected ? "2px solid #c0392b" : "1.5px solid rgba(26,18,9,0.12)", borderRadius: 4, background: isSelected ? "rgba(192,57,43,0.04)" : "white", cursor: "pointer", textAlign: "center", transition: "all 0.2s", fontFamily: "inherit" }}>
                        <div style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 26, fontWeight: 700, color: isSelected ? "#c0392b" : "#1a1209", lineHeight: 1 }}>{m}</div>
                        <div style={{ fontSize: 12, color: "rgba(26,18,9,0.45)", margin: "4px 0 2px" }}>個月</div>
                        <div style={{ fontSize: 11, color: colors[idx], fontWeight: 600 }}>{labels[idx]}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {selectedMonths && (
                <div style={{ background: "#f8f4ed", borderRadius: 4, padding: "16px 20px", marginBottom: 24 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                    {[["總學習天數", `${totalDays} 天`], ["每日新單字", "8 個"], ["週期測驗", "每 7 天 30 題"], ["每日時間", "約 20 分鐘"], ["文法重點", "每天 3 個"], ["目標詞彙量", `${totalDays * 8}+ 個`]].map(([label, value]) => (
                      <div key={label}>
                        <div style={{ fontSize: 11, color: "rgba(26,18,9,0.4)", marginBottom: 3 }}>{label}</div>
                        <div style={{ fontSize: 15, fontWeight: 600, color: "#1a1209", fontFamily: "'Noto Serif JP', serif" }}>{value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ marginBottom: 24 }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {["📖 8個核心單字", "🔤 振り仮名標注", "💬 實用例句", "✍️ 3個文法重點", "🎯 週期測驗30題", "📊 AI 批改", "🔊 日語發音"].map(item => (
                    <span key={item} style={{ padding: "6px 14px", background: "white", border: "1px solid rgba(26,18,9,0.1)", borderRadius: 20, fontSize: 13, color: "#3d2f1e" }}>{item}</span>
                  ))}
                </div>
              </div>

              <button onClick={handleStart} disabled={!selectedMonths || !userName.trim() || loading} style={{ width: "100%", padding: "15px", background: selectedMonths && userName.trim() ? "#c0392b" : "rgba(26,18,9,0.08)", color: selectedMonths && userName.trim() ? "white" : "rgba(26,18,9,0.3)", border: "none", borderRadius: 2, fontFamily: "inherit", fontSize: 16, fontWeight: 500, cursor: selectedMonths && userName.trim() ? "pointer" : "not-allowed", transition: "all 0.25s" }}>
                開始{selectedMonths ? selectedMonths + "個月" : ""}特訓計畫 →
              </button>
            </div>
          </div>
        )}

        <p style={{ textAlign: "center", marginTop: 24, fontSize: 12, color: "rgba(26,18,9,0.3)" }}>
          已登入：{session?.user?.email} · 資料同步至 Google Drive
        </p>
      </div>

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
  );
}

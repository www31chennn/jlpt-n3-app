"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type UserData = { userName: string; months: number; currentDay: number; fileId?: string; quizResults?: unknown[]; completedDays?: number[]; };

type QuizQuestion = {
  id: number;
  type: "vocab" | "grammar" | "reading" | "fill" | "meaning" | "usage";
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  relatedWord?: string;
};

type QuizData = {
  cycleNumber: number;
  daysReviewed: number[];
  questions: QuizQuestion[];
  reviewWords: string[];
};

export default function QuizPage() {
  const router = useRouter();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [quizData, setQuizData] = useState<QuizData | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [showResult, setShowResult] = useState(false);
  const [quizComplete, setQuizComplete] = useState(false);
  const [phase, setPhase] = useState<"intro" | "quiz" | "review">("intro");

  const loadQuiz = useCallback(async (user: UserData, cycleNum?: number) => {
    setLoading(true);
    try {
      // 支援指定週期（從 URL 參數讀）
      const targetCycle = cycleNum ?? Math.ceil(user.currentDay / 7);
      const cycleEnd = targetCycle * 7;
      const cycleStart = cycleEnd - 6;

      // 從 localStorage 讀這7天學過的單字（用帶課程名稱的 key）
      const activeCourseForWords = localStorage.getItem("jlpt_active_course");
      const wordListKey = activeCourseForWords ? `jlpt_word_list_${activeCourseForWords}` : "jlpt_word_list";
      const wordListRaw = localStorage.getItem(wordListKey);
      const allWordsByDay = wordListRaw ? JSON.parse(wordListRaw) : {};
      const wordsData: Record<number, string[]> = {};
      for (let d = cycleStart; d <= cycleEnd; d++) {
        if (allWordsByDay[String(d)] || allWordsByDay[d]) {
          wordsData[d] = allWordsByDay[String(d)] || allWordsByDay[d];
        }
      }

      // 從 localStorage 或 Drive 合併檔案讀每天的文法重點
      const activeCourse = localStorage.getItem("jlpt_active_course");
      const grammarData: Record<number, unknown> = {};

      // 先從 localStorage 讀有快取的天
      let needDrive = false;
      for (let d = cycleStart; d <= cycleEnd; d++) {
        const cached = localStorage.getItem(`jlpt_content_day_${d}`);
        if (cached) {
          grammarData[d] = JSON.parse(cached);
        } else {
          needDrive = true;
        }
      }

      // 若有缺少的天，從 Drive 合併檔案一次讀取
      if (needDrive && activeCourse) {
        try {
          const driveFile = `course_${activeCourse}_content.json`;
          const res = await fetch(`/api/drive?file=${encodeURIComponent(driveFile)}`);
          const { data: allContent } = await res.json();
          if (allContent) {
            for (let d = cycleStart; d <= cycleEnd; d++) {
              if (!grammarData[d] && allContent[String(d)]) {
                grammarData[d] = allContent[String(d)];
                localStorage.setItem(`jlpt_content_day_${d}`, JSON.stringify(allContent[String(d)]));
              }
            }
          }
        } catch {}
      }

      const res = await fetch("/api/generate-quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userName: user.userName,
          months: user.months,
          dayStart: cycleStart,
          dayEnd: cycleEnd,
          wordsData,
          grammarData,
        }),
      });
      const data = await res.json();
      if (data.quiz) {
        setQuizData(data.quiz);
        setAnswers(new Array(data.quiz.questions.length).fill(null));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  const searchParams = useSearchParams();
  const cycleParam = searchParams.get("cycle");

  useEffect(() => {
    const init = async () => {
      try {
        const activeCourse = localStorage.getItem("jlpt_active_course");
        if (!activeCourse) { router.push("/"); return; }
        const res = await fetch(`/api/drive?file=${encodeURIComponent(`course_${activeCourse}.json`)}`);
        const { data } = await res.json();
        if (!data?.userName) { router.push("/"); return; }
        setUserData(data);
        const cycleNum = cycleParam ? parseInt(cycleParam) : undefined;
        loadQuiz(data, cycleNum);
      } catch {
        router.push("/");
      }
    };
    init();
  }, [router, loadQuiz, cycleParam]);

  const selectAnswer = (optionIdx: number) => {
    if (showResult) return;
    const newAnswers = [...answers];
    newAnswers[currentQ] = optionIdx;
    setAnswers(newAnswers);
    setShowResult(true);
  };

  const nextQuestion = () => {
    setShowResult(false);
    if (currentQ < (quizData?.questions.length ?? 0) - 1) {
      setCurrentQ(currentQ + 1);
    } else {
      setQuizComplete(true);
      setPhase("review");
    }
  };

  const getScore = () => {
    if (!quizData) return 0;
    return answers.filter((a, i) => a === quizData.questions[i].correctIndex).length;
  };

  const finishQuiz = async () => {
    if (!userData) return;
    const score = getScore();
    const total = quizData?.questions.length ?? 0;
    const quizResult = { score, total, cycle: quizData?.cycleNumber, date: new Date().toISOString() };
    const updated = {
      ...userData,
      quizResults: [...(userData.quizResults || []), quizResult],
    };
    const activeCourse = localStorage.getItem("jlpt_active_course") ?? "";
    await fetch(`/api/drive?file=${encodeURIComponent(`course_${activeCourse}.json`)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: updated }),
    }).catch(() => {});
    router.push("/dashboard");
  };

  if (loading) return <LoadingScreen />;
  if (!quizData || !userData) return null;

  const score = getScore();
  const total = quizData.questions.length;
  const percentage = Math.round((score / total) * 100);
  const q = quizData.questions[currentQ];
  const userAnswer = answers[currentQ];
  const isCorrect = userAnswer === q?.correctIndex;

  if (phase === "intro") {
    return (
      <IntroScreen
        userData={userData}
        quizData={quizData}
        onStart={() => setPhase("quiz")}
        onBack={() => router.push("/dashboard")}
      />
    );
  }

  if (phase === "review") {
    return (
      <ReviewScreen
        userData={userData}
        quizData={quizData}
        answers={answers}
        score={score}
        total={total}
        percentage={percentage}
        onFinish={finishQuiz}
      />
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f8f4ed", fontFamily: "'Noto Sans JP', 'Noto Sans TC', sans-serif" }}>
      {/* Top nav */}
      <div style={{ background: "white", borderBottom: "1px solid rgba(26,18,9,0.08)", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 50 }}>
        <button
          onClick={() => {
            if (window.confirm("確定要離開測驗嗎？目前進度不會保存，下次需要重新作答。")) {
              router.push("/dashboard");
            }
          }}
          style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#1a1209" }}
        >←</button>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 13, color: "#c0392b", fontWeight: 600 }}>週期測驗 #{quizData.cycleNumber}</div>
          <div style={{ fontSize: 12, color: "rgba(26,18,9,0.5)" }}>{currentQ + 1} / {total}</div>
        </div>
        {/* Progress dots */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", maxWidth: 120, justifyContent: "flex-end" }}>
          {quizData.questions.map((_, i) => (
            <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: answers[i] !== null ? (answers[i] === quizData.questions[i].correctIndex ? "#2e7d4f" : "#c0392b") : i === currentQ ? "#c9a84c" : "rgba(26,18,9,0.15)" }} />
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "36px 20px" }}>
        {/* Question type badge */}
        <div style={{ marginBottom: 20 }}>
          <span style={{ fontSize: 11, color: "#c0392b", fontWeight: 600, letterSpacing: "0.12em", background: "rgba(192,57,43,0.08)", padding: "4px 10px", borderRadius: 20 }}>
            {q.type === "vocab" || q.type === "meaning" ? "📖 意思" : q.type === "reading" ? "🔤 讀音" : q.type === "grammar" ? "✍️ 文法" : q.type === "fill" ? "✏️ 填空" : q.type === "usage" ? "✅ 用法" : "📖 單字"}
          </span>
          {q.relatedWord && (
            <span style={{ fontSize: 11, color: "rgba(26,18,9,0.4)", marginLeft: 8 }}>關聯：{q.relatedWord}</span>
          )}
        </div>

        {/* Question */}
        <div style={{ background: "white", border: "1px solid rgba(26,18,9,0.08)", borderRadius: 4, padding: "28px 32px", marginBottom: 20, boxShadow: "0 2px 12px rgba(26,18,9,0.05)" }}>
          <div style={{ height: 3, background: "linear-gradient(90deg, #c0392b, #c9a84c)", margin: "-28px -32px 24px -32px", borderRadius: "4px 4px 0 0" }} />
          <div style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 20, color: "#1a1209", lineHeight: 1.6 }}>{q.question}</div>
        </div>

        {/* Options */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
          {q.options.map((opt, i) => {
            let bg = "white";
            let border = "1.5px solid rgba(26,18,9,0.12)";
            let color = "#1a1209";
            if (showResult) {
              if (i === q.correctIndex) { bg = "rgba(46,125,79,0.08)"; border = "2px solid #2e7d4f"; color = "#2e7d4f"; }
              else if (i === userAnswer && i !== q.correctIndex) { bg = "rgba(192,57,43,0.06)"; border = "2px solid #c0392b"; color = "#c0392b"; }
            } else if (userAnswer === i) {
              border = "2px solid #c0392b"; bg = "rgba(192,57,43,0.04)";
            }
            return (
              <button key={i} onClick={() => selectAnswer(i)} disabled={showResult} style={{ padding: "14px 18px", border, borderRadius: 2, background: bg, color, fontFamily: "inherit", fontSize: 15, textAlign: "left", cursor: showResult ? "default" : "pointer", transition: "all 0.2s", display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ width: 24, height: 24, borderRadius: "50%", background: showResult && i === q.correctIndex ? "#2e7d4f" : showResult && i === userAnswer && i !== q.correctIndex ? "#c0392b" : "rgba(26,18,9,0.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0, color: showResult && (i === q.correctIndex || i === userAnswer) ? "white" : "rgba(26,18,9,0.5)", fontWeight: 700 }}>
                  {showResult && i === q.correctIndex ? "✓" : showResult && i === userAnswer && i !== q.correctIndex ? "✗" : String.fromCharCode(65 + i)}
                </span>
                {opt}
              </button>
            );
          })}
        </div>

        {/* Explanation */}
        {showResult && (
          <div style={{ animation: "slideUp 0.3s ease" }}>
            <div style={{ background: isCorrect ? "rgba(46,125,79,0.06)" : "rgba(192,57,43,0.05)", border: `1px solid ${isCorrect ? "rgba(46,125,79,0.2)" : "rgba(192,57,43,0.2)"}`, borderRadius: 4, padding: "18px 22px", marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: isCorrect ? "#2e7d4f" : "#c0392b", marginBottom: 10 }}>
                {isCorrect ? "✓ 正確！" : "✗ 答錯了"}
              </div>
              <div style={{ fontSize: 14, color: "#1a1209", lineHeight: 1.7 }}>{q.explanation}</div>
            </div>
            <button onClick={nextQuestion} style={{ width: "100%", padding: "14px", background: "#c0392b", color: "white", border: "none", borderRadius: 2, fontFamily: "inherit", fontSize: 15, fontWeight: 500, cursor: "pointer" }}>
              {currentQ < total - 1 ? "下一題 →" : "查看結果 →"}
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}

function IntroScreen({ userData, quizData, onStart, onBack }: {
  userData: UserData; quizData: QuizData; onStart: () => void; onBack: () => void;
}) {
  return (
    <div style={{ minHeight: "100vh", background: "#f8f4ed", fontFamily: "'Noto Sans JP', 'Noto Sans TC', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 520, width: "100%" }}>
        <div style={{ background: "white", border: "1px solid rgba(26,18,9,0.08)", borderRadius: 4, overflow: "hidden", boxShadow: "0 4px 24px rgba(26,18,9,0.08)", textAlign: "center", padding: "48px 40px" }}>
          <div style={{ height: 3, background: "linear-gradient(90deg, #c0392b, #c9a84c)", margin: "-48px -40px 40px -40px" }} />
          <div style={{ fontSize: 48, marginBottom: 16 }}>🎯</div>
          <div style={{ fontSize: 11, color: "#c0392b", fontWeight: 600, letterSpacing: "0.15em", marginBottom: 12 }}>週期測驗 #{quizData.cycleNumber}</div>
          <h2 style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 26, fontWeight: 700, color: "#1a1209", marginBottom: 12 }}>
            第 {quizData.daysReviewed[0]}–{quizData.daysReviewed[quizData.daysReviewed.length - 1]} 天複習
          </h2>
          <p style={{ fontSize: 14, color: "rgba(26,18,9,0.55)", lineHeight: 1.7, marginBottom: 28 }}>
            {userData.userName}，本次測驗將考察這 7 天學習的單字與文法。<br />共 {quizData.questions.length} 題，作答後會有詳細解析。
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginBottom: 32 }}>
            {quizData.reviewWords.slice(0, 10).map((w) => (
              <span key={w} style={{ padding: "4px 12px", background: "#f8f4ed", border: "1px solid rgba(26,18,9,0.1)", borderRadius: 20, fontSize: 13, fontFamily: "'Noto Serif JP', serif" }}>{w}</span>
            ))}
          </div>
          <button onClick={onStart} style={{ width: "100%", padding: "15px", background: "#c0392b", color: "white", border: "none", borderRadius: 2, fontFamily: "inherit", fontSize: 16, fontWeight: 500, cursor: "pointer", marginBottom: 12 }}>
            開始測驗 →
          </button>
          <button onClick={onBack} style={{ width: "100%", padding: "12px", background: "transparent", color: "rgba(26,18,9,0.45)", border: "1px solid rgba(26,18,9,0.12)", borderRadius: 2, fontFamily: "inherit", fontSize: 14, cursor: "pointer" }}>
            返回課表
          </button>
        </div>
      </div>
    </div>
  );
}

function ReviewScreen({ userData, quizData, answers, score, total, percentage, onFinish }: {
  userData: UserData; quizData: QuizData; answers: (number | null)[]; score: number; total: number; percentage: number; onFinish: () => void;
}) {
  const grade = percentage >= 80 ? { label: "優秀", color: "#2e7d4f", emoji: "🌟" } : percentage >= 60 ? { label: "良好", color: "#c9a84c", emoji: "👍" } : { label: "繼續加油", color: "#c0392b", emoji: "💪" };
  const wrongQuestions = quizData.questions.filter((_, i) => answers[i] !== quizData.questions[i].correctIndex);

  return (
    <div style={{ minHeight: "100vh", background: "#f8f4ed", fontFamily: "'Noto Sans JP', 'Noto Sans TC', sans-serif" }}>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "40px 20px" }}>
        {/* Score card */}
        <div style={{ background: "white", border: "1px solid rgba(26,18,9,0.08)", borderRadius: 4, overflow: "hidden", marginBottom: 20, textAlign: "center", boxShadow: "0 4px 24px rgba(26,18,9,0.07)" }}>
          <div style={{ height: 3, background: "linear-gradient(90deg, #c0392b, #c9a84c)" }} />
          <div style={{ padding: "36px 40px" }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>{grade.emoji}</div>
            <div style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 56, fontWeight: 900, color: grade.color, lineHeight: 1 }}>{percentage}%</div>
            <div style={{ fontSize: 16, color: grade.color, fontWeight: 600, margin: "8px 0 16px" }}>{grade.label}</div>
            <div style={{ fontSize: 14, color: "rgba(26,18,9,0.5)" }}>{score} / {total} 答對 · 週期 #{quizData.cycleNumber}</div>

            {/* Score breakdown */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, margin: "24px 0 0" }}>
              <div style={{ background: "rgba(46,125,79,0.06)", borderRadius: 4, padding: "14px" }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#2e7d4f" }}>{score}</div>
                <div style={{ fontSize: 12, color: "rgba(26,18,9,0.45)" }}>答對</div>
              </div>
              <div style={{ background: "rgba(192,57,43,0.06)", borderRadius: 4, padding: "14px" }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#c0392b" }}>{total - score}</div>
                <div style={{ fontSize: 12, color: "rgba(26,18,9,0.45)" }}>答錯</div>
              </div>
            </div>
          </div>
        </div>

        {/* Wrong answers review */}
        {wrongQuestions.length > 0 && (
          <div style={{ background: "white", border: "1px solid rgba(26,18,9,0.08)", borderRadius: 4, overflow: "hidden", marginBottom: 20 }}>
            <div style={{ height: 3, background: "#c0392b" }} />
            <div style={{ padding: "24px 28px" }}>
              <div style={{ fontSize: 12, color: "#c0392b", fontWeight: 600, letterSpacing: "0.12em", marginBottom: 16 }}>✦ 需要加強的題目</div>
              {wrongQuestions.map((q, i) => {
                const qi = quizData.questions.indexOf(q);
                return (
                  <div key={i} style={{ padding: "16px 18px", background: "#f8f4ed", borderRadius: 4, marginBottom: 10, borderLeft: "3px solid #c0392b" }}>
                    <div style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 15, color: "#1a1209", marginBottom: 8 }}>{q.question}</div>
                    <div style={{ fontSize: 13, color: "#2e7d4f", marginBottom: 6 }}>✓ 正確答案：{q.options[q.correctIndex]}</div>
                    <div style={{ fontSize: 13, color: "rgba(26,18,9,0.55)", lineHeight: 1.6 }}>📝 {q.explanation}</div>
                    {answers[qi] !== null && (
                      <div style={{ fontSize: 12, color: "#c0392b", marginTop: 6 }}>✗ 你的答案：{q.options[answers[qi]!]}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Encouragement */}
        <div style={{ background: percentage >= 80 ? "rgba(46,125,79,0.05)" : "rgba(201,168,76,0.06)", border: `1px solid ${percentage >= 80 ? "rgba(46,125,79,0.2)" : "rgba(201,168,76,0.2)"}`, borderRadius: 4, padding: "18px 24px", marginBottom: 20, textAlign: "center" }}>
          <div style={{ fontSize: 14, color: "#1a1209", lineHeight: 1.7 }}>
            {percentage >= 80 ? `${userData.userName}，你的掌握程度很好！繼續保持這樣的學習節奏。` : percentage >= 60 ? `${userData.userName}，不錯的表現！建議複習錯誤的題目再繼續前進。` : `${userData.userName}，別灰心！錯誤的地方正是學習的機會。建議再看看那幾天的學習內容。`}
          </div>
        </div>

        <button onClick={onFinish} style={{ width: "100%", padding: "15px", background: "#c0392b", color: "white", border: "none", borderRadius: 2, fontFamily: "inherit", fontSize: 16, fontWeight: 500, cursor: "pointer" }}>
          繼續學習第 {userData.currentDay} 天 →
        </button>
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div style={{ minHeight: "100vh", background: "#f8f4ed", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Noto Sans JP', sans-serif", gap: 16 }}>
      <div style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 32, color: "#c0392b", animation: "pulse 1.5s ease infinite" }}>問</div>
      <div style={{ fontSize: 14, color: "rgba(26,18,9,0.45)" }}>正在生成測驗題目...</div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
  );
}
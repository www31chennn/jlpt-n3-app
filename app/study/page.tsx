"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

type UserData = {
  userName: string;
  months: number;
  totalDays?: number;
  startDate: string;
  currentDay: number;
  completedDays?: number[];
  quizResults?: unknown[];
  schedule?: unknown;
  generatedUntil?: number;
  fileId?: string;
};

type Word = {
  kanji: string;
  hiragana: string;
  romaji: string;
  meaning: string;
  partOfSpeech: string;
  sentences: { jp: string; furigana: string; zh: string }[];
  mnemonics: string;
};

type GrammarPoint = {
  pattern: string;
  explanation: string;
  examples: { jp: string; furigana: string; zh: string }[];
};

type DailyContent = {
  day: number;
  theme: string;
  words: Word[];
  grammarPoints: GrammarPoint[];
  dailyChallenge: string;
};

// Web Speech API
function speakJapanese(text: string) {
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "ja-JP";
  utter.rate = 0.75;
  utter.pitch = 1.05;
  const voices = window.speechSynthesis.getVoices();
  const jaVoice = voices.find(v => v.lang === "ja-JP" && v.localService) ||
                  voices.find(v => v.lang === "ja-JP") ||
                  voices.find(v => v.lang.startsWith("ja"));
  if (jaVoice) utter.voice = jaVoice;
  window.speechSynthesis.speak(utter);
}

function SpeakButton({ text, size = 20 }: { text: string; size?: number }) {
  const [playing, setPlaying] = useState(false);
  const handle = () => {
    if (playing) return;
    setPlaying(true);
    speakJapanese(text);
    setTimeout(() => setPlaying(false), text.length * 180 + 500);
  };
  return (
    <button onClick={handle} title="播放發音" style={{
      background: playing ? "rgba(192,57,43,0.12)" : "rgba(26,18,9,0.05)",
      border: `1px solid ${playing ? "rgba(192,57,43,0.3)" : "rgba(26,18,9,0.12)"}`,
      borderRadius: "50%", width: size + 14, height: size + 14,
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      cursor: playing ? "default" : "pointer", transition: "all 0.2s", flexShrink: 0,
    }}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
        stroke={playing ? "#c0392b" : "#1a1209"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {playing
          ? <><circle cx="12" cy="12" r="10"/><line x1="10" y1="15" x2="10" y2="9"/><line x1="14" y1="15" x2="14" y2="9"/></>
          : <><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></>
        }
      </svg>
    </button>
  );
}

// 判斷是否為漢字
function isKanji(ch: string) {
  const code = ch.charCodeAt(0);
  return (code >= 0x4E00 && code <= 0x9FFF) ||
         (code >= 0x3400 && code <= 0x4DBF) ||
         (code >= 0xF900 && code <= 0xFAFF);
}

// 判斷是否為假名（平假名或片假名）
function isKana(ch: string) {
  const code = ch.charCodeAt(0);
  return (code >= 0x3040 && code <= 0x309F) || // 平假名
         (code >= 0x30A0 && code <= 0x30FF);   // 片假名
}

// 解析句子，把漢字區塊和對應假名配對，只在漢字上標注
// jp: 原文  furigana: 整句的平假名版本
// 策略：找出漢字區塊，用 furigana 版本對應推算讀音，只標漢字
function parseRuby(jp: string, furigana: string): { text: string; ruby?: string }[] {
  // 如果沒有漢字，直接回傳原文不標注
  if (![...jp].some(isKanji)) return [{ text: jp }];

  // 把原文切成「漢字區塊」和「非漢字區塊」交替的 segments
  const segments: { text: string; isKanji: boolean }[] = [];
  let buf = "";
  let lastIsKanji = false;
  for (const ch of jp) {
    const k = isKanji(ch);
    if (buf && k !== lastIsKanji) {
      segments.push({ text: buf, isKanji: lastIsKanji });
      buf = "";
    }
    buf += ch;
    lastIsKanji = k;
  }
  if (buf) segments.push({ text: buf, isKanji: lastIsKanji });

  // 用非漢字區塊當分隔符，從 furigana 中切出漢字對應的讀音
  const result: { text: string; ruby?: string }[] = [];
  let remaining = furigana;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (!seg.isKanji) {
      // 非漢字區塊：在 furigana 中找對應位置並跳過
      // 去掉標點、空格的差異做寬鬆匹配
      const normalized = seg.text.replace(/[。、！？「」『』（）]/g, "");
      if (normalized) {
        // 在 remaining 中找這段文字並推進
        let found = false;
        for (const ch of [...seg.text]) {
          if (isKana(ch) || ch === "ー") {
            const idx = remaining.indexOf(ch);
            if (idx >= 0) remaining = remaining.slice(idx + 1);
            found = true;
          }
        }
        if (!found) {
          // 標點等直接跳過
        }
      }
      result.push({ text: seg.text });
    } else {
      // 漢字區塊：找下一個非漢字區塊當右邊界
      const nextNonKanji = segments[i + 1];
      let kanjiReading = "";

      if (!nextNonKanji) {
        // 最後一段，剩餘全部就是讀音
        kanjiReading = remaining.replace(/[。、！？「」\s]/g, "");
      } else {
        // 找右邊界（下一個非漢字段的第一個假名）在 remaining 中的位置
        const boundary = [...nextNonKanji.text].find(isKana);
        if (boundary) {
          const idx = remaining.indexOf(boundary);
          if (idx > 0) {
            kanjiReading = remaining.slice(0, idx);
            remaining = remaining.slice(idx);
          } else {
            kanjiReading = remaining.slice(0, seg.text.length * 2);
            remaining = remaining.slice(seg.text.length * 2);
          }
        } else {
          kanjiReading = remaining.slice(0, seg.text.length * 2);
          remaining = remaining.slice(seg.text.length * 2);
        }
      }
      result.push({ text: seg.text, ruby: kanjiReading || undefined });
    }
  }
  return result;
}

// Ruby 標注元件：只在漢字上標平假名
function RubySentence({ jp, furigana, fontSize = 16 }: { jp: string; furigana: string; fontSize?: number }) {
  const parts = parseRuby(jp, furigana);
  return (
    <span style={{ fontFamily: "'Noto Serif JP', serif", fontSize, color: "#1a1209", lineHeight: 2.2 }}>
      {parts.map((p, i) =>
        p.ruby ? (
          <ruby key={i} style={{ rubyAlign: "center" } as React.CSSProperties}>
            {p.text}
            <rt style={{ fontSize: fontSize * 0.55, color: "#c0392b", fontFamily: "'Noto Sans JP', sans-serif", fontWeight: 400 }}>
              {p.ruby}
            </rt>
          </ruby>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </span>
  );
}

// 單字主體的 Ruby（漢字大字）
function RubyWord({ kanji, hiragana, fontSize = 52 }: { kanji: string; hiragana: string; fontSize?: number }) {
  const display = kanji || hiragana;
  if (!display || display === hiragana || ![...display].some(isKanji)) {
    return <span style={{ fontFamily: "'Noto Serif JP', serif", fontSize, fontWeight: 900, color: "#1a1209", lineHeight: 1.4 }}>{display}</span>;
  }
  const parts = parseRuby(display, hiragana);
  return (
    <span style={{ fontFamily: "'Noto Serif JP', serif", fontSize, fontWeight: 900, color: "#1a1209", lineHeight: 1.8, display: "inline-flex", alignItems: "flex-end" }}>
      {parts.map((p, i) =>
        p.ruby ? (
          <ruby key={i} style={{ rubyAlign: "center" } as React.CSSProperties}>
            {p.text}
            <rt style={{ fontSize: fontSize * 0.28, color: "#c0392b", fontWeight: 400, fontFamily: "'Noto Sans JP', sans-serif" }}>{p.ruby}</rt>
          </ruby>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </span>
  );
}

// 今日挑戰區塊
function DailyChallenge({ challenge, day, theme }: { challenge: string; day: number; theme: string }) {
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<{ correct: boolean; comment: string; correction?: string } | null>(null);
  const [checking, setChecking] = useState(false);

  const checkAnswer = async () => {
    if (!answer.trim()) return;
    setChecking(true);
    try {
      const res = await fetch("/api/check-challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challenge, answer, day, theme }),
      });
      const data = await res.json();
      setFeedback(data.feedback);
    } catch {
      setFeedback({ correct: false, comment: "檢查失敗，請稍後再試。" });
    } finally {
      setChecking(false);
    }
  };

  return (
    <div style={{ background: "rgba(192,57,43,0.04)", border: "1px solid rgba(192,57,43,0.15)", borderRadius: 4, padding: "20px 22px", marginBottom: 24 }}>
      <div style={{ fontSize: 11, color: "#c0392b", fontWeight: 600, letterSpacing: "0.12em", marginBottom: 10 }}>✦ 今日挑戰</div>
      <div style={{ fontSize: 14, color: "#1a1209", lineHeight: 1.7, marginBottom: 16 }}>{challenge}</div>

      <textarea
        value={answer}
        onChange={e => { setAnswer(e.target.value); setFeedback(null); }}
        placeholder="用日文回答..."
        rows={3}
        style={{ width: "100%", padding: "12px 14px", border: "1.5px solid rgba(26,18,9,0.15)", borderRadius: 2, fontFamily: "'Noto Serif JP', serif", fontSize: 15, color: "#1a1209", background: "white", resize: "vertical", outline: "none", boxSizing: "border-box" }}
        onFocus={e => e.target.style.borderColor = "#c0392b"}
        onBlur={e => e.target.style.borderColor = "rgba(26,18,9,0.15)"}
      />

      <button onClick={checkAnswer} disabled={!answer.trim() || checking}
        style={{ marginTop: 10, padding: "10px 24px", background: answer.trim() ? "#c0392b" : "rgba(26,18,9,0.1)", color: answer.trim() ? "white" : "rgba(26,18,9,0.3)", border: "none", borderRadius: 2, fontFamily: "inherit", fontSize: 14, cursor: answer.trim() ? "pointer" : "not-allowed", transition: "all 0.2s" }}>
        {checking ? "批改中..." : "送出批改 →"}
      </button>

      {feedback && (
        <div style={{ marginTop: 14, padding: "14px 18px", background: feedback.correct ? "rgba(46,125,79,0.06)" : "rgba(192,57,43,0.05)", border: `1px solid ${feedback.correct ? "rgba(46,125,79,0.2)" : "rgba(192,57,43,0.2)"}`, borderRadius: 4, animation: "slideUp 0.3s ease" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: feedback.correct ? "#2e7d4f" : "#c0392b", marginBottom: 8 }}>
            {feedback.correct ? "✓ 很好！" : "✗ 需要修正"}
          </div>
          <div style={{ fontSize: 14, color: "#1a1209", lineHeight: 1.7 }}>{feedback.comment}</div>
          {feedback.correction && (
            <div style={{ marginTop: 10, padding: "10px 14px", background: "white", borderRadius: 2, borderLeft: "3px solid #c9a84c" }}>
              <div style={{ fontSize: 11, color: "#c9a84c", fontWeight: 600, marginBottom: 4 }}>建議修改</div>
              <div style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 15, color: "#1a1209" }}>{feedback.correction}</div>
            </div>
          )}
          {feedback.correct && (
            <button onClick={() => { setAnswer(""); setFeedback(null); }} style={{ marginTop: 10, padding: "6px 16px", background: "transparent", border: "1px solid rgba(46,125,79,0.3)", borderRadius: 2, color: "#2e7d4f", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
              再試一次
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function StudyInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isPreview = searchParams.get("preview") === "1";
  const [userData, setUserData] = useState<UserData | null>(null);
  const [content, setContent] = useState<DailyContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeWord, setActiveWord] = useState(0);
  const [completedWords, setCompletedWords] = useState<Set<number>>(new Set());
  const [dayComplete, setDayComplete] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [previewDay, setPreviewDay] = useState<number | null>(null);

  const loadContent = useCallback(async (user: UserData, targetDay?: number) => {
    setLoading(true);
    const day = targetDay ?? user.currentDay;
    try {
      const cacheKey = `jlpt_content_day_${day}`;
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        setContent(JSON.parse(cached));
        // 恢復已讀單字記錄
        const doneKey = `jlpt_done_day_${day}`;
        const done = localStorage.getItem(doneKey);
        if (done) {
          const doneSet = new Set<number>(JSON.parse(done));
          setCompletedWords(doneSet);
          if (JSON.parse(cached).words && doneSet.size === JSON.parse(cached).words.length) {
            setDayComplete(true);
          }
        }
        setLoading(false);
        return;
      }
      const activeCourse = localStorage.getItem("jlpt_active_course");
      const wordListKey = activeCourse ? `jlpt_word_list_${activeCourse}` : "jlpt_word_list";
      const wordListRaw = localStorage.getItem(wordListKey);
      const wordsByDay = wordListRaw ? JSON.parse(wordListRaw) : {};
      const words: string[] = wordsByDay[String(day)] || wordsByDay[day] || [];

      // 嘗試從 Drive 合併內容檔案讀取
      const driveContentFile = activeCourse ? `course_${activeCourse}_content.json` : `content.json`;
      try {
        const driveRes = await fetch(`/api/drive?file=${encodeURIComponent(driveContentFile)}`);
        const { data: allContent } = await driveRes.json();
        if (allContent?.[String(day)]?.words) {
          const dayContent = allContent[String(day)];
          setContent(dayContent);
          localStorage.setItem(cacheKey, JSON.stringify(dayContent));
          setLoading(false);
          return;
        }
      } catch {}

      const res = await fetch("/api/daily-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day, months: user.months, userName: user.userName, words }),
      });
      const data = await res.json();
      if (data.content) {
        setContent(data.content);
        localStorage.setItem(cacheKey, JSON.stringify(data.content));
        // 存到 Drive 合併檔案（背景執行）
        const activeCourse = localStorage.getItem("jlpt_active_course");
        const driveContentFile = activeCourse ? `course_${activeCourse}_content.json` : `content.json`;
        // 先讀現有內容，再合併新的天
        fetch(`/api/drive?file=${encodeURIComponent(driveContentFile)}`)
          .then(r => r.json())
          .then(({ data: existing }) => {
            const updated = { ...(existing || {}), [String(day)]: data.content };
            return fetch(`/api/drive?file=${encodeURIComponent(driveContentFile)}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ data: updated }),
            });
          }).catch(() => {});
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        const activeCourse = localStorage.getItem("jlpt_active_course");
        if (!activeCourse) { router.push("/"); return; }
        const file = `course_${activeCourse}.json`;
        const res = await fetch(`/api/drive?file=${encodeURIComponent(file)}`);
        const { data } = await res.json();
        if (!data?.userName) { router.push("/"); return; }
        setUserData(data);
        const dayParam = searchParams.get("day");
        if (isPreview && dayParam) {
          const day = parseInt(dayParam);
          setPreviewDay(day);
          loadContent(data, day);
        } else {
          loadContent(data);
        }
      } catch {
        router.push("/");
      }
    };
    init();
  }, [router, isPreview, searchParams]);

  const markWordDone = (idx: number) => {
    const next = new Set(completedWords);
    next.add(idx);
    setCompletedWords(next);
    // 存已讀單字到 localStorage（返回時可恢復）
    const day = previewDay ?? userData?.currentDay;
    if (day) {
      localStorage.setItem(`jlpt_done_day_${day}`, JSON.stringify([...next]));
    }
    if (content && next.size === content.words.length) {
      setDayComplete(true);
      // 完成當天立即儲存進度到 Drive
      if (userData && !isPreview) {
        const completedDay = previewDay ?? userData.currentDay;
        const updatedCompletedDays = [...new Set([...(userData.completedDays || []), completedDay])];
        const updatedUserData = { ...userData, completedDays: updatedCompletedDays };
        setUserData(updatedUserData);
        const activeCourse3 = localStorage.getItem("jlpt_active_course");
        const saveFile3 = activeCourse3 ? `course_${activeCourse3}.json` : "learning_plan.json";
        fetch(`/api/drive?file=${encodeURIComponent(saveFile3)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: updatedUserData }),
        }).catch(() => {});
      }
    }
  };

  const goToNextDay = async () => {
    if (!userData || isNavigating) return;
    setIsNavigating(true);
    const nextDay = userData.currentDay + 1;
    const updated = { ...userData, currentDay: nextDay };
    // 先更新 UI
    setUserData(updated);
    setCompletedWords(new Set());
    setDayComplete(false);
    setActiveWord(0);
    // 存到 Drive（不等回應，不阻塞 UI）
    const activeCourse4 = localStorage.getItem("jlpt_active_course");
    const saveFile4 = activeCourse4 ? `course_${activeCourse4}.json` : "learning_plan.json";
    fetch(`/api/drive?file=${encodeURIComponent(saveFile4)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: updated }),
    }).catch(() => {});
    setIsNavigating(false);
    if (nextDay % 7 === 1 && nextDay > 1) {
      const cycle = Math.ceil(userData.currentDay / 7);
      router.push(`/quiz?cycle=${cycle}`);
    } else {
      loadContent(updated, nextDay);
    }
  };

  const totalDays = userData ? userData.months * 30 : 90;
  const progress = userData ? (userData.currentDay / totalDays) * 100 : 0;
  const isQuizDue = userData && userData.currentDay > 1 && (userData.currentDay - 1) % 7 === 0;

  if (loading) return <LoadingScreen />;
  if (!content || !userData) return null;

  const word = content.words[activeWord];
  const isLastWord = activeWord === content.words.length - 1;
  const displayDay = previewDay ?? userData.currentDay;

  return (
    <div style={{ minHeight: "100vh", background: "#f8f4ed", fontFamily: "'Noto Sans JP', 'Noto Sans TC', sans-serif" }}>
      {/* Nav */}
      <div style={{ background: "white", borderBottom: "1px solid rgba(26,18,9,0.08)", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 50 }}>
        <button onClick={() => router.push(isPreview ? "/dashboard" : "/dashboard")} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#1a1209" }}>←</button>
        <div style={{ textAlign: "center" }}>
          {isPreview && <div style={{ fontSize: 11, color: "#c9a84c", fontWeight: 600, marginBottom: 2 }}>👁 預覽模式 · 第 {previewDay} 天</div>}
          {!isPreview && <div style={{ fontSize: 12, color: "rgba(26,18,9,0.4)", marginBottom: 2 }}>{userData.userName} · {userData.months}個月計畫</div>}
          <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1209" }}>第 {displayDay} 天 / {totalDays} 天</div>
        </div>
        {!isPreview && isQuizDue ? (
          <button onClick={() => router.push("/quiz")} style={{ background: "#c0392b", color: "white", border: "none", padding: "7px 14px", borderRadius: 2, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>測驗 →</button>
        ) : (
          <button onClick={() => router.push("/dashboard")} style={{ background: "none", border: "1px solid rgba(26,18,9,0.15)", padding: "6px 12px", borderRadius: 2, fontSize: 12, cursor: "pointer", color: "#1a1209", fontFamily: "inherit" }}>課表</button>
        )}
      </div>

      <div style={{ maxWidth: 680, margin: "0 auto", padding: "32px 20px" }}>
        {/* Header */}
        <div style={{ marginBottom: 28, display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 12, color: "#c0392b", fontWeight: 600, letterSpacing: "0.1em", marginBottom: 6 }}>DAY {displayDay} · {content.theme}</div>
            <h2 style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 22, color: "#1a1209", fontWeight: 700 }}>今日學習內容</h2>
          </div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: 220 }}>
            {content.words.map((_, i) => (
              <div key={i} onClick={() => setActiveWord(i)}
                style={{ width: 26, height: 26, borderRadius: "50%", background: completedWords.has(i) ? "#2e7d4f" : i === activeWord ? "#c0392b" : "rgba(26,18,9,0.1)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: completedWords.has(i) || i === activeWord ? "white" : "rgba(26,18,9,0.5)", transition: "all 0.2s" }}>
                {completedWords.has(i) ? "✓" : i + 1}
              </div>
            ))}
          </div>
        </div>

        {/* Word card */}
        <div style={{ background: "white", border: "1px solid rgba(26,18,9,0.08)", borderRadius: 4, overflow: "hidden", marginBottom: 20, boxShadow: "0 2px 16px rgba(26,18,9,0.06)" }}>
          <div style={{ height: 3, background: "linear-gradient(90deg, #c0392b, #c9a84c)" }} />
          <div style={{ padding: "28px 32px" }}>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: "rgba(26,18,9,0.35)", marginBottom: 12 }}>{word.partOfSpeech}</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 20, marginBottom: 10 }}>
                <RubyWord kanji={word.kanji} hiragana={word.hiragana} fontSize={52} />
                <SpeakButton text={word.kanji || word.hiragana} size={24} />
              </div>
              <div style={{ fontSize: 13, color: "rgba(26,18,9,0.4)", letterSpacing: "0.12em" }}>{word.romaji}</div>
            </div>

            <div style={{ background: "#f8f4ed", borderRadius: 4, padding: "14px 18px", marginBottom: 16, textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#1a1209", marginBottom: 6 }}>{word.meaning}</div>
              <div style={{ fontSize: 13, color: "rgba(26,18,9,0.5)", fontStyle: "italic" }}>💡 {word.mnemonics}</div>
            </div>

            <div>
              {word.sentences.map((s, si) => (
                <div key={si} style={{ padding: "12px 16px", background: si % 2 === 0 ? "rgba(192,57,43,0.03)" : "white", borderRadius: 2, marginBottom: 8, borderLeft: "2px solid rgba(192,57,43,0.25)" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 6 }}>
                    <div style={{ flex: 1 }}>
                      <RubySentence jp={s.jp} furigana={s.furigana} fontSize={16} />
                    </div>
                    <SpeakButton text={s.jp} size={15} />
                  </div>
                  <div style={{ fontSize: 13, color: "rgba(26,18,9,0.6)" }}>{s.zh}</div>
                </div>
              ))}
            </div>

            {!completedWords.has(activeWord) && !isPreview && (
              <button onClick={() => { markWordDone(activeWord); if (!isLastWord) setActiveWord(activeWord + 1); }}
                style={{ width: "100%", padding: "11px", border: "none", borderRadius: 2, background: "#2e7d4f", color: "white", fontFamily: "inherit", fontSize: 14, fontWeight: 500, cursor: "pointer", marginTop: 12 }}>
                ✓ 已記住，{isLastWord ? "完成今日單字" : "下一個 →"}
              </button>
            )}
          </div>
        </div>

        {/* Word navigation */}
        <div style={{ display: "flex", gap: 8, marginBottom: 28 }}>
          <button onClick={() => setActiveWord(Math.max(0, activeWord - 1))} disabled={activeWord === 0}
            style={{ flex: 1, padding: "10px", border: "1.5px solid rgba(26,18,9,0.12)", borderRadius: 2, background: "white", fontFamily: "inherit", fontSize: 13, color: activeWord === 0 ? "rgba(26,18,9,0.25)" : "#1a1209", cursor: activeWord === 0 ? "not-allowed" : "pointer" }}>
            ← 上一個
          </button>
          <button onClick={() => setActiveWord(Math.min(content.words.length - 1, activeWord + 1))} disabled={isLastWord}
            style={{ flex: 1, padding: "10px", border: "1.5px solid rgba(26,18,9,0.12)", borderRadius: 2, background: "white", fontFamily: "inherit", fontSize: 13, color: isLastWord ? "rgba(26,18,9,0.25)" : "#1a1209", cursor: isLastWord ? "not-allowed" : "pointer" }}>
            下一個 →
          </button>
        </div>

        {/* Grammar points */}
        {content.grammarPoints?.map((gp, gi) => (
          <div key={gi} style={{ background: "white", border: "1px solid rgba(26,18,9,0.08)", borderRadius: 4, overflow: "hidden", marginBottom: 16, boxShadow: "0 2px 8px rgba(26,18,9,0.04)" }}>
            <div style={{ height: 3, background: `linear-gradient(90deg, ${gi === 0 ? "#c9a84c, #8fa8b8" : gi === 1 ? "#8fa8b8, #2e7d4f" : "#2e7d4f, #c9a84c"})` }} />
            <div style={{ padding: "20px 24px" }}>
              <div style={{ fontSize: 11, color: "#c9a84c", fontWeight: 600, letterSpacing: "0.12em", marginBottom: 10 }}>✦ 文法重點 {gi + 1}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                <div style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 18, fontWeight: 700, color: "#1a1209" }}>{gp.pattern}</div>
                <SpeakButton text={gp.pattern} size={15} />
              </div>
              <div style={{ fontSize: 13, color: "#5a4a35", lineHeight: 1.7, marginBottom: 12 }}>{gp.explanation}</div>
              {gp.examples.map((ex, i) => (
                <div key={i} style={{ padding: "10px 14px", background: "#f8f4ed", borderRadius: 2, marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 3 }}>
                    <div style={{ flex: 1 }}>
                      <RubySentence jp={ex.jp} furigana={ex.furigana} fontSize={14} />
                    </div>
                    <SpeakButton text={ex.jp} size={13} />
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(26,18,9,0.55)" }}>{ex.zh}</div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Daily challenge */}
        <DailyChallenge
          challenge={content.dailyChallenge}
          day={displayDay}
          theme={content.theme}
        />

        {/* Progress bar */}
        {!isPreview && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "rgba(26,18,9,0.4)", marginBottom: 6 }}>
              <span>今日單字進度</span>
              <span>{completedWords.size} / {content.words.length}</span>
            </div>
            <div style={{ background: "#ede8df", borderRadius: 4, height: 6, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(completedWords.size / content.words.length) * 100}%`, background: "linear-gradient(90deg, #c0392b, #c9a84c)", borderRadius: 4, transition: "width 0.4s" }} />
            </div>
          </div>
        )}

        {/* Complete */}
        {dayComplete && !isPreview && (
          <div style={{ animation: "slideUp 0.4s ease" }}>
            <div style={{ background: "rgba(46,125,79,0.05)", border: "1px solid rgba(46,125,79,0.2)", borderRadius: 4, padding: "20px 24px", marginBottom: 16, textAlign: "center" }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>🎉</div>
              <div style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 18, fontWeight: 700, color: "#2e7d4f", marginBottom: 4 }}>今日學習完成！</div>
              <div style={{ fontSize: 14, color: "rgba(26,18,9,0.55)" }}>已記住 {content.words.length} 個單字，繼續加油！</div>
            </div>
            <button onClick={goToNextDay} style={{ width: "100%", padding: "15px", background: "#c0392b", color: "white", border: "none", borderRadius: 2, fontFamily: "inherit", fontSize: 16, fontWeight: 500, cursor: "pointer" }}>
              {userData.currentDay % 7 === 0 ? "🎯 進行週期測驗 →" : `前往第 ${userData.currentDay + 1} 天 →`}
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        ruby { ruby-align: center; }
      `}</style>
    </div>
  );
}

export default function StudyPage() {
  return (
    <Suspense fallback={null}>
      <StudyInner />
    </Suspense>
  );
}

function LoadingScreen() {
  return (
    <div style={{ minHeight: "100vh", background: "#f8f4ed", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Noto Sans JP', sans-serif", gap: 16 }}>
      <div style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 32, color: "#c0392b", animation: "pulse 1.5s ease infinite" }}>日</div>
      <div style={{ fontSize: 14, color: "rgba(26,18,9,0.45)" }}>正在生成今日學習內容...</div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
  );
}
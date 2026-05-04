# 🗾 日本語N3特訓計畫

零基礎 → JLPT N3 的智能學習系統。每日自動生成個性化學習內容，週期出題測驗，學習紀錄儲存至 Google Drive。

## ✨ 功能特色

- **個人化課表**：輸入目標月數（3/6/9/12個月），AI自動生成課程架構
- **每日學習**：5個主題單字 + 假名 + 發音 + 2個例句 + 記憶訣竅 + 文法重點
- **週期測驗**：每7天自動生成10題綜合測驗（單字、文法、閱讀、填空）
- **詳細解析**：每題答後顯示解析，錯題重點複習
- **進度儲存**：學習紀錄自動儲存至 Google Drive，跨裝置同步

## 🚀 快速部署到 Vercel

### 1. 取得 Anthropic API Key
前往 https://console.anthropic.com 建立 API Key。

### 2. 設定 Google Drive Service Account

1. 前往 Google Cloud Console (https://console.cloud.google.com)
2. 建立新專案 → 啟用 Google Drive API
3. 「IAM 與管理員」→「服務帳戶」→ 建立服務帳戶 → 下載 JSON 金鑰
4. 從 JSON 中取出對應的環境變數值

### 3. 部署到 Vercel

```bash
npm i -g vercel
vercel login
vercel
```

或直接在 vercel.com 匯入 GitHub 儲存庫。

### 4. Vercel 環境變數設定

| 變數名稱 | 說明 |
|---------|------|
| ANTHROPIC_API_KEY | Anthropic API 金鑰 |
| GOOGLE_PROJECT_ID | GCP 專案 ID |
| GOOGLE_PRIVATE_KEY_ID | Service Account 私鑰 ID |
| GOOGLE_PRIVATE_KEY | Service Account 私鑰（完整含 BEGIN/END） |
| GOOGLE_CLIENT_EMAIL | Service Account Email |
| GOOGLE_CLIENT_ID | Service Account Client ID |

## 💻 本機開發

```bash
cp .env.local.example .env.local
# 填入你的 API Keys
npm install
npm run dev
```

## 📚 學習架構

每7天為一個週期：
- 第1-7天：每日5個單字 + 文法 + 例句
- 第8天起：週期測驗（10題）+ 詳細解析

學習路徑：
- 第1-30天：N5基礎
- 第31-60天：N4進階
- 第61天+：N3標準

## 📁 專案結構

```
app/
├── page.tsx              # 首頁：設定課程
├── study/page.tsx        # 每日學習
├── quiz/page.tsx         # 週期測驗
└── api/
    ├── generate-schedule/
    ├── daily-content/
    ├── generate-quiz/
    ├── save-progress/
    └── load-progress/
lib/
└── googleDrive.ts
```

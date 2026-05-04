import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/components/Providers";
import PageTransition from "@/components/PageTransition";

export const metadata: Metadata = {
  title: "日本語N3特訓計畫",
  description: "零基礎到JLPT N3的智能學習系統",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@400;700;900&family=Noto+Sans+JP:wght@300;400;500;700&family=Kaisei+Decol:wght@400;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <Providers>
          <PageTransition />
          {children}
        </Providers>
      </body>
    </html>
  );
}

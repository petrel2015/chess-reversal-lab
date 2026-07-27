import type { Metadata } from "next";
import "./globals.css";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  "https://chess-reversal-lab.hy19950714.chatgpt.site/";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "逆转棋局｜自定义残局推演",
  description: "自由布置国际象棋残局，让 Stockfish 为你指定的一方寻找最佳路线。",
  openGraph: {
    title: "逆转棋局",
    description: "自由摆局 · Stockfish 推演",
    type: "website",
    images: [{ url: "og.png", width: 1747, height: 909, alt: "逆转棋局自定义残局推演" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "逆转棋局",
    description: "自由摆局 · Stockfish 推演",
    images: ["og.png"],
  },
  icons: {
    icon: "favicon.svg",
    shortcut: "favicon.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}

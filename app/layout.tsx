import type { Metadata, Viewport } from "next";
import "./globals.css";
import { I18nProvider } from "./lib/i18n";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  "https://chess-reversal-lab.hy19950714.chatgpt.site/";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: "逆转棋局",
  title: "逆转棋局 · AI 国际象棋推演",
  description: "自由布置国际象棋残局，让 Stockfish 为你指定的一方寻找最佳路线。",
  manifest: "site.webmanifest",
  appleWebApp: {
    capable: true,
    title: "逆转棋局",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
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
    icon: [
      { url: "icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "icon-192.png",
    apple: [
      { url: "apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#0c0e0c",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body>
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}

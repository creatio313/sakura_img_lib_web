import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  ),
  title: "画像管理支援システム",
  description:
    "さくらのクラウドのオブジェクトストレージに格納された画像を管理するためのアプリケーションです。高火力 DOKによるAI画像生成・加工・超解像も可能です。",
  icons: {
    icon: "/favicon.ico",
  },
  openGraph: {
    title: "画像管理支援システム",
    description:
      "さくらのクラウドのオブジェクトストレージに格納された画像を管理するためのアプリケーションです。高火力 DOKによるAI画像生成・加工・超解像も可能です。",
    type: "website",
    locale: "ja_JP",
    images: [
      {
        url: "images/ogp/home.jpg",
        width: 1200,
        height: 630,
        alt: "画像管理支援システム",
      },
    ],
  },
  twitter: {
    card: "summary",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

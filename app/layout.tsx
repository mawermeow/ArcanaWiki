import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import React from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "ArcanaWiki",
  description: "塔羅 LLM Wiki 與可引用的塔羅解讀。",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ArcanaWiki"
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#efe6d1"
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body className="min-h-screen text-ink font-sans antialiased">{children}</body>
    </html>
  );
}

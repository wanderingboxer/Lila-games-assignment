import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "LILA Player Journey Explorer",
  description:
    "Interactive map-and-timeline explorer for LILA BLACK player telemetry — built for the Level Design team.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-ink-950 text-zinc-200">{children}</body>
    </html>
  );
}

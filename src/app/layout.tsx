import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "vercel-claude-code",
  description: "Claude Code rebuilt with Vercel AI SDK — 107x compression, 13 core capabilities",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased font-mono">{children}</body>
    </html>
  );
}

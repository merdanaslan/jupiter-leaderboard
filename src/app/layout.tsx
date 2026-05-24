import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trading Cup Leaderboard",
  description: "Solana Summit Germany Trading Cup leaderboard powered by Jupiter Perps",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}

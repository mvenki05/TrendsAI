import type { Metadata } from "next";
import { Outfit, Fira_Code, Fraunces } from "next/font/google";
import { ClientShell } from "@/components/client-shell";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

const firaCode = Fira_Code({
  variable: "--font-fira-code",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz"],
});

export const metadata: Metadata = {
  title: "TrendLens — Upload-Driven Trend Intelligence",
  description: "Upload a report, extract its megatrend taxonomy, and measure what's growing in Google Trends",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${outfit.variable} ${firaCode.variable} ${fraunces.variable}`}>
      <body className="antialiased bg-[#FAF9F6] text-slate-900">
        <ClientShell>{children}</ClientShell>
      </body>
    </html>
  );
}

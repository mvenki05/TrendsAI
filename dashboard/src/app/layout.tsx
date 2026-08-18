import type { Metadata } from "next";
import { Inter, Fira_Code, Fraunces } from "next/font/google";
import { ClientShell } from "@/components/client-shell";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
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
  title: "TrendLens: Trend Intelligence",
  description: "Upload a report, extract its megatrend taxonomy, and measure what's growing in Google Trends",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${firaCode.variable} ${fraunces.variable}`}>
      <body className="antialiased bg-[#FAF9F6] text-slate-900">
        <ClientShell>{children}</ClientShell>
      </body>
    </html>
  );
}

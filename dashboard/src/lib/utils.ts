import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Time-window options for the trend zoom (weeks of the stored 52-week series). */
export const PERIODS = [
  { w: 13, l: "3M" },
  { w: 26, l: "6M" },
  { w: 52, l: "12M" },
] as const;

/** Parse a stored JSON weekly-interest series into numbers. */
export function parseSeries(raw: string | null | undefined): number[] {
  if (!raw) return [];
  try {
    const a = JSON.parse(raw);
    return Array.isArray(a) ? a.map(Number).filter((v) => Number.isFinite(v)) : [];
  } catch {
    return [];
  }
}

/** Recompute interest/growth over a (sliced) weekly window — no new Trends calls. */
export function windowStats(series: number[]): {
  current: number | null; yoy: number | null; rising: boolean; hasData: boolean;
} {
  const v = series.filter((x) => Number.isFinite(x));
  const m = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  if (v.length < 2) {
    return { current: v.length ? Math.round(v[v.length - 1]) : null, yoy: null, rising: false, hasData: v.some((x) => x > 0) };
  }
  const current = Math.round(m(v.slice(-Math.min(4, v.length))));
  const prior = m(v.slice(0, Math.min(4, v.length)));
  const yoy = prior > 0 ? Math.round((current / prior - 1) * 1000) / 10 : null;
  const rising = yoy != null && yoy >= 15 && current >= 2;
  return { current, yoy, rising, hasData: current > 0 };
}

/** Opportunity label based on a 0-100 score. */
export function opportunityLabel(score: number): { label: string; color: string } {
  if (score >= 70) return { label: "Strong Opportunity", color: "text-red-400" };
  if (score >= 50) return { label: "Emerging",           color: "text-yellow-400" };
  if (score >= 30) return { label: "Watch",              color: "text-blue-400" };
  return              { label: "Too Early",          color: "text-slate-500" };
}

/** Velocity-only label — used on Term Discovery page. */
export function velocityLabel(velocity: number): { label: string; color: string } {
  if (velocity >= 70) return { label: "High Momentum", color: "text-red-400" };
  if (velocity >= 40) return { label: "Growing",       color: "text-yellow-400" };
  if (velocity >= 20) return { label: "Present",       color: "text-orange-400" };
  return              { label: "Low Activity",     color: "text-slate-500" };
}

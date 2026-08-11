import { NextResponse } from "next/server";
import path from "path";
import { spawn } from "child_process";

export const runtime = "nodejs";

// Trigger a Trend Map build (harvest -> extract -> cluster -> write).
export async function POST() {
  try {
    const py = spawn("python", ["-m", "src.trend_map"], {
      cwd: path.join(process.cwd(), ".."),
      detached: true,
      stdio: "ignore",
    });
    py.unref();
    return NextResponse.json({ status: "running" });
  } catch (error) {
    console.error("Trend Map trigger failed:", error);
    return NextResponse.json({ error: "Failed to start Trend Map build" }, { status: 500 });
  }
}

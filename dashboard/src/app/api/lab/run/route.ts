import { NextResponse } from "next/server";
import path from "path";
import { spawn } from "child_process";

export const runtime = "nodejs";

// Trigger a bottom-up Trend Lab run (harvest -> extract -> cluster -> memos).
export async function POST() {
  try {
    const py = spawn("python", ["-m", "src.lab"], {
      cwd: path.join(process.cwd(), ".."),
      detached: true,
      stdio: "ignore",
    });
    py.unref();
    return NextResponse.json({ status: "running" });
  } catch (error) {
    console.error("Trend Lab trigger failed:", error);
    return NextResponse.json({ error: "Failed to start Trend Lab run" }, { status: 500 });
  }
}

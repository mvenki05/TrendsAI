import { NextResponse } from "next/server";
import path from "path";
import { spawn } from "child_process";

export const runtime = "nodejs";

// Trigger the Google Trends measurement for a report (browser-based, cached).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!/^rep_[a-z0-9]+$/.test(id)) {
      return NextResponse.json({ error: "Invalid report id" }, { status: 400 });
    }
    const root = path.join(process.cwd(), "..");
    const py = spawn("python", ["-m", "src.map_searches", id], {
      cwd: root,
      detached: true,
      stdio: "ignore",
    });
    py.unref();
    return NextResponse.json({ status: "measuring", report_id: id });
  } catch (error) {
    console.error("Measure trigger failed:", error);
    return NextResponse.json({ error: "Failed to start measurement" }, { status: 500 });
  }
}

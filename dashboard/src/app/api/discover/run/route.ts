import { NextResponse } from "next/server";
import path from "path";
import { spawn } from "child_process";

export const runtime = "nodejs";

// Trigger web discovery (--validate measures Google Trends growth on discovered terms).
export async function POST(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const validate = searchParams.get("validate") === "1";
    const args = validate ? ["-m", "src.discover_web", "--validate"] : ["-m", "src.discover_web"];
    const py = spawn("python", args, {
      cwd: path.join(process.cwd(), ".."),
      detached: true,
      stdio: "ignore",
    });
    py.unref();
    return NextResponse.json({ status: validate ? "validating" : "discovering" });
  } catch (error) {
    console.error("Discovery trigger failed:", error);
    return NextResponse.json({ error: "Failed to start discovery" }, { status: 500 });
  }
}

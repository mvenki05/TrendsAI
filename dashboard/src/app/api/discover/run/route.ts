import { NextResponse } from "next/server";
import path from "path";
import { spawn } from "child_process";
import { PYTHON_BIN } from "@/lib/python-bin";

export const runtime = "nodejs";
export const maxDuration = 900;

// Trigger web discovery (--validate measures Google Trends growth on discovered terms)
// and wait for it to actually finish, instead of firing detached with stdio:"ignore" and
// returning a status that says nothing about whether it succeeded (same dead-end pattern
// /api/map/run and /api/lab/run had — fixed here the same way).
let running = false;

export async function POST(req: Request) {
  if (running) {
    return NextResponse.json(
      { status: "error", error: "A discovery run is already in progress — wait for it to finish." },
      { status: 409 },
    );
  }
  running = true;

  try {
    const { searchParams } = new URL(req.url);
    const validate = searchParams.get("validate") === "1";
    const args = validate ? ["-m", "src.discover_web", "--validate"] : ["-m", "src.discover_web"];

    const { code, output } = await new Promise<{ code: number | null; output: string }>((resolve) => {
      const py = spawn(PYTHON_BIN, args, { cwd: path.join(process.cwd(), "..") });
      let output = "";
      py.stdout.on("data", (d) => { output += d.toString(); });
      py.stderr.on("data", (d) => { output += d.toString(); });
      py.on("close", (code) => resolve({ code, output }));
      py.on("error", (err) => resolve({ code: -1, output: String(err) }));
    });

    if (code === 0 && !/Traceback \(most recent call last\)/.test(output)) {
      return NextResponse.json({ status: "ok", output: output.slice(-3000) });
    }

    const noKey = /LiteLLM is not configured|Could not resolve authentication method/i.test(output);
    return NextResponse.json({
      status: "error",
      error: noKey
        ? "Discovery failed: LiteLLM isn't configured on this server, so the extraction LLM steps can't run."
        : "Discovery failed — see output.",
      output: output.slice(-3000),
    }, { status: 500 });
  } finally {
    running = false;
  }
}

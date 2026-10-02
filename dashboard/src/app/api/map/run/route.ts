import { NextResponse } from "next/server";
import path from "path";
import { spawn } from "child_process";
import { PYTHON_BIN } from "@/lib/python-bin";

export const runtime = "nodejs";
export const maxDuration = 900;

// Trigger a Trend Map build (harvest -> extract -> cluster -> write) and wait for it to
// actually finish, so the caller gets a real result instead of a fire-and-forget "ok".
let running = false;

export async function POST() {
  if (running) {
    return NextResponse.json(
      { status: "error", error: "A map build is already in progress — wait for it to finish." },
      { status: 409 },
    );
  }
  running = true;

  try {
    const { code, output } = await new Promise<{ code: number | null; output: string }>((resolve) => {
      const py = spawn(PYTHON_BIN, ["-m", "src.trend_map"], {
        cwd: path.join(process.cwd(), ".."),
      });
      let output = "";
      py.stdout.on("data", (d) => { output += d.toString(); });
      py.stderr.on("data", (d) => { output += d.toString(); });
      py.on("close", (code) => resolve({ code, output }));
      py.on("error", (err) => resolve({ code: -1, output: String(err) }));
    });

    if (code === 0 && !/Traceback \(most recent call last\)/.test(output)) {
      return NextResponse.json({ status: "ok", output: output.slice(-2000) });
    }

    const noKey = /LiteLLM is not configured|Could not resolve authentication method/i.test(output);
    return NextResponse.json({
      status: "error",
      error: noKey
        ? "Build failed: LiteLLM isn't configured on this server, so the extract/cluster LLM steps can't run."
        : "Build failed — see output.",
      output: output.slice(-2000),
    }, { status: 500 });
  } finally {
    running = false;
  }
}

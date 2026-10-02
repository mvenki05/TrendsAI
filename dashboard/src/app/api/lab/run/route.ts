import { NextResponse } from "next/server";
import path from "path";
import { spawn } from "child_process";
import { PYTHON_BIN } from "@/lib/python-bin";

export const runtime = "nodejs";
export const maxDuration = 1800;

// Trigger a full White Space Scout run (harvest -> extract -> novelty/fit gates -> write)
// and wait for it to actually finish (10-20 min: real web harvest + several LLM passes),
// so the caller gets a real result instead of a fire-and-forget "running" that never
// resolves either way — this used to spawn detached with stdio:"ignore" (same dead-end
// pattern /api/map/run had) so a crash (e.g. no LLM configured) was invisible; the button
// just said "Scouting..." forever with no way to tell it had actually died.
let running = false;

export async function POST() {
  if (running) {
    return NextResponse.json(
      { status: "error", error: "A scout run is already in progress — wait for it to finish." },
      { status: 409 },
    );
  }
  running = true;

  try {
    const { code, output } = await new Promise<{ code: number | null; output: string }>((resolve) => {
      const py = spawn(PYTHON_BIN, ["-m", "src.lab"], {
        cwd: path.join(process.cwd(), ".."),
      });
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
        ? "Scout run failed: LiteLLM isn't configured on this server, so the idea-extraction LLM steps can't run."
        : "Scout run failed — see output.",
      output: output.slice(-3000),
    }, { status: 500 });
  } finally {
    running = false;
  }
}

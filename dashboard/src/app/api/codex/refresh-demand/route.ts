import { NextResponse } from "next/server";
import path from "path";
import { spawn } from "child_process";
import { PYTHON_BIN } from "@/lib/python-bin";

export const runtime = "nodejs";
export const maxDuration = 900;

// Re-measures every Codex dossier's Google Trends demand terms via a real browser
// (scripts/refresh_codex_demand.py --apply) and waits for it to finish — this is a
// ~5-10 min operation (one Playwright request per term, deliberately paced so Google
// doesn't throttle it), so callers should expect the request itself to be slow.
//
// A module-level lock prevents two overlapping runs: the script does a
// WRITE_TRUNCATE replace of the whole codex_megatrends table at the end, so a second
// run finishing first would have its update clobbered by the first run's stale write.
let running = false;

export async function POST() {
  if (running) {
    return NextResponse.json(
      { status: "error", error: "A demand refresh is already running — wait for it to finish." },
      { status: 409 },
    );
  }
  running = true;

  try {
    const { code, output } = await new Promise<{ code: number | null; output: string }>((resolve) => {
      const py = spawn(PYTHON_BIN, ["-m", "scripts.refresh_codex_demand", "--apply"], {
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
        ? "Refresh failed: LiteLLM isn't configured on this server, so the demand-summary rewrite can't run."
        : "Refresh failed — see output.",
      output: output.slice(-3000),
    }, { status: 500 });
  } finally {
    running = false;
  }
}

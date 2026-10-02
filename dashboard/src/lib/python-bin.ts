// Absolute path to the real Python interpreter, used by every API route that spawns a
// Python script (codex refresh, trend_map, lab, discover_web, map_searches, upload).
//
// This machine has THREE "python.exe" resolvable on PATH (`where python` lists all of
// them): the real interpreter, a second Python install, and a Windows Store "app
// execution alias" stub that — when invoked non-interactively with stdio piped, as
// child_process.spawn always does — exits almost instantly with completely empty
// stdout/stderr and a non-zero code. A bare `spawn("python", ...)` depends on whatever
// PATH the Next.js dev server process happened to inherit at its own startup, which can
// silently resolve to the stub instead of the real interpreter (this is what caused the
// intermittent "Refresh failed — see output." with output:"" bug — it looked like a
// real crash but was actually this stub winning PATH resolution in that server's
// process). Hardcoding the absolute path removes that ambiguity entirely.
export const PYTHON_BIN = "C:\\Program Files\\Python310\\python.exe";

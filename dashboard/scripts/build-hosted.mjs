// Build the hosted static export (marketinganalytics.puw.tyson.com/trends/).
//
// Next.js refuses `output: "export"` while POST route handlers exist, and all of
// src/app/api is local-only anyway (the hosted UI talks to FastAPI /api/trends/*),
// so the handlers are moved aside for the duration of the build and always restored.
//
// Output: dashboard/out/ — copied into the CIMA frontend repo's public/trends/ by
// the monorepo's scripts/sync_to_cima.py --trends step.
import { execSync } from "node:child_process";
import { existsSync, renameSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const apiDir = join(root, "src", "app", "api");
const standby = join(root, ".api-standby");

if (existsSync(standby)) {
  console.error(".api-standby already exists — a previous build was interrupted. Restore it to src/app/api first.");
  process.exit(1);
}

// Clear the build cache: .next may hold generated route-type stubs for the
// api dir (possibly synced from another machine via OneDrive) that fail to
// resolve once the api dir is moved aside.
rmSync(join(root, ".next"), { recursive: true, force: true });

renameSync(apiDir, standby);
try {
  // --webpack: Turbopack dies on OneDrive cloud-placeholder hydration (os error 389);
  // the dev script uses --webpack for the same reason.
  execSync("npx next build --webpack", {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      HOSTED_EXPORT: "1",
      NEXT_PUBLIC_HOSTED: "1",
      NEXT_PUBLIC_API_BASE: "/api/trends",
      NEXT_PUBLIC_BASE_PATH: "/trends",
    },
  });
} finally {
  renameSync(standby, apiDir);
}
console.log("Hosted export written to out/");

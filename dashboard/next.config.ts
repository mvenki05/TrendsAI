import type { NextConfig } from "next";

// HOSTED_EXPORT=1 → static export served at marketinganalytics.puw.tyson.com/trends/
// by the CIMA frontend's static file server (dist/trends/). Built via `npm run build:hosted`,
// which also moves src/app/api aside (route handlers can't be statically exported).
// Local dev (`npm run dev`) is unaffected.
const hosted = process.env.HOSTED_EXPORT === "1";

// Tried relocating distDir outside the OneDrive-synced tree (to dodge OneDrive's periodic
// file-locking crashes, see CLAUDE.md dev-server notes) — reverted: Next's server route
// compilation requires its compiled distDir to stay within node_modules' resolution
// ancestry, so moving it out broke /api/file/[id] outright ("Cannot find module
// 'next/dist/compiled/next-server/app-route.runtime.dev.js'") instead of just reducing an
// intermittent crash. Not worth trading a rare crash for a guaranteed one.
const nextConfig: NextConfig = hosted
  ? {
      output: "export",
      basePath: "/trends",
      trailingSlash: true,
      images: { unoptimized: true },
    }
  : {
      // Baseline security headers for the server-rendered app (a static export can't set
      // headers; the host serving dist/trends/ is responsible for those). No CSP yet: Next's
      // dev tooling and inline styles need a tuned policy, so adding one blind would break pages.
      async headers() {
        return [
          {
            source: "/:path*",
            headers: [
              { key: "X-Content-Type-Options", value: "nosniff" },
              { key: "X-Frame-Options", value: "SAMEORIGIN" },
              { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
              { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
            ],
          },
        ];
      },
    };

export default nextConfig;

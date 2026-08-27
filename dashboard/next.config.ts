import type { NextConfig } from "next";

// HOSTED_EXPORT=1 → static export served at marketinganalytics.puw.tyson.com/trends/
// by the CIMA frontend's static file server (dist/trends/). Built via `npm run build:hosted`,
// which also moves src/app/api aside (route handlers can't be statically exported).
// Local dev (`npm run dev`) is unaffected.
const hosted = process.env.HOSTED_EXPORT === "1";

const nextConfig: NextConfig = hosted
  ? {
      output: "export",
      basePath: "/trends",
      trailingSlash: true,
      images: { unoptimized: true },
    }
  : {};

export default nextConfig;

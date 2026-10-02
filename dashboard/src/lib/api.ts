// Central API base for all client-side fetches.
//
// Local dev: Next route handlers under /api (this repo, src/app/api/*).
// Hosted static export (marketinganalytics.puw.tyson.com/trends): the shared
// FastAPI backend at /api/trends — the route handlers are excluded from the
// export build and their read queries live in backend/api/routes/trends.py
// of the NIQ monorepo instead.
//
// Both values are baked in at build time (NEXT_PUBLIC_*).

/** True in the hosted build — hides local-only affordances (upload, measure, run, file links). */
export const HOSTED = process.env.NEXT_PUBLIC_HOSTED === "1";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "/api";

/** Prefix an API path ("/reports", `/report/${id}`) with the active base. */
export const apiUrl = (path: string): string => `${API_BASE}${path}`;

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Prefix a public/ asset path for raw <img>/CSS urls — next/image handles basePath itself, raw tags don't. */
export const assetUrl = (path: string): string => `${BASE_PATH}${path}`;

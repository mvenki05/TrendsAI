import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { query, DATASET, PROJECT_ID } from "@/lib/bigquery";

export const runtime = "nodejs";

const MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

// Serve the ORIGINAL source document for a report_id, so citations open the real file.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Two valid id shapes exist: current uploads (rep_<12 hex>) and legacy SharePoint-batch
  // ids (rep_sp_<slug>). Alphanumeric+underscore only — also doubles as SQL-safety for
  // the @id parameter below.
  if (!/^rep_[a-zA-Z0-9_]+$/.test(id)) {
    return NextResponse.json({ error: "Bad report id" }, { status: 400 });
  }
  try {
    const rows = (await query(
      `SELECT r.filename, sp.file_path AS sharepoint_path
       FROM \`${PROJECT_ID}.${DATASET}.reports\` r
       LEFT JOIN \`${PROJECT_ID}.${DATASET}.sharepoint_files\` sp USING (report_id)
       WHERE r.report_id = @id LIMIT 1`,
      { id }
    )) as { filename: string; sharepoint_path?: string }[];
    if (!rows.length) return NextResponse.json({ error: "Unknown report" }, { status: 404 });
    const { filename, sharepoint_path } = rows[0];
    const ext = path.extname(filename).toLowerCase();
    const root = path.join(process.cwd(), "..");
    const candidates = [
      // PPTX decks that have a converted PDF rendition (enables #page= deep links,
      // which browsers can't do for PPTX) — prefer it over the original.
      ...(ext === ".pptx" ? [{ p: path.join(root, "uploads", `${id}.pdf`), ext: ".pdf" }] : []),
      { p: path.join(root, "uploads", `${id}${ext}`), ext },
      { p: path.join(root, "uploads", filename), ext },
      { p: path.join(root, "uploads", "mintel", filename), ext },
      { p: path.join(root, "uploads", "tyson", filename), ext },
      { p: path.join(root, "docs", filename), ext },
      // Original SharePoint/OneDrive path — no copy needed
      ...(sharepoint_path ? [{ p: sharepoint_path, ext }] : []),
    ];
    for (const { p, ext: candidateExt } of candidates) {
      try {
        const buf = await readFile(p);
        const servedName = candidateExt !== ext ? filename.replace(/\.[^.]+$/, candidateExt) : filename;
        return new NextResponse(new Uint8Array(buf), {
          headers: {
            "Content-Type": MIME[candidateExt] ?? "application/octet-stream",
            "Content-Disposition": `inline; filename="${encodeURIComponent(servedName)}"`,
            "Cache-Control": "private, max-age=3600",
          },
        });
      } catch {
        /* try next candidate */
      }
    }
    return NextResponse.json({ error: "Source file not found on disk" }, { status: 404 });
  } catch (error) {
    console.error("File serve failed:", error);
    return NextResponse.json({ error: "Failed to serve file" }, { status: 500 });
  }
}

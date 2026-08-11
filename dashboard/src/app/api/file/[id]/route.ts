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
  if (!/^rep_[a-f0-9]{12}$/.test(id)) {
    return NextResponse.json({ error: "Bad report id" }, { status: 400 });
  }
  try {
    const rows = (await query(`
      SELECT filename FROM \`${PROJECT_ID}.${DATASET}.reports\`
      WHERE report_id = '${id}' LIMIT 1
    `)) as { filename: string }[];
    if (!rows.length) return NextResponse.json({ error: "Unknown report" }, { status: 404 });
    const filename = rows[0].filename;
    const ext = path.extname(filename).toLowerCase();
    const root = path.join(process.cwd(), "..");
    const candidates = [
      path.join(root, "uploads", `${id}${ext}`),
      path.join(root, "uploads", filename),
      path.join(root, "uploads", "mintel", filename),
      path.join(root, "uploads", "tyson", filename),
      path.join(root, "docs", filename),
    ];
    for (const p of candidates) {
      try {
        const buf = await readFile(p);
        return new NextResponse(new Uint8Array(buf), {
          headers: {
            "Content-Type": MIME[ext] ?? "application/octet-stream",
            "Content-Disposition": `inline; filename="${encodeURIComponent(filename)}"`,
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

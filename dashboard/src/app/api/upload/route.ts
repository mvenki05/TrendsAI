import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import { PYTHON_BIN } from "@/lib/python-bin";
import { randomBytes } from "crypto";
import { query, DATASET, PROJECT_ID } from "@/lib/bigquery";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const ALLOWED = [".pptx", ".pdf"];

const MAX_UPLOAD_BYTES = 150 * 1024 * 1024;

export async function POST(req: Request) {
  const limited = rateLimit(req, "upload", 15, 60 * 60_000);
  if (limited) return limited;
  // Reject on the declared size before buffering the multipart body into memory.
  if (Number(req.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES + 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 150 MB)" }, { status: 413 });
  }
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "File too large (max 150 MB)" }, { status: 413 });
    }
    const ext = path.extname(file.name).toLowerCase();
    if (!ALLOWED.includes(ext)) {
      return NextResponse.json({ error: "Only .pptx and .pdf are supported" }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());

    // Identity is the filename: re-uploading a name updates THAT report in place
    // (the pipeline skips re-extraction if the content is byte-for-byte unchanged).
    const existing = await query<{ report_id: string }>(
      `SELECT report_id FROM \`${PROJECT_ID}.${DATASET}.reports\`
       WHERE filename = @fn ORDER BY uploaded_at DESC LIMIT 1`,
      { fn: file.name }
    );
    const replacing = existing.length > 0;
    const reportId = replacing ? existing[0].report_id : "rep_" + randomBytes(6).toString("hex");

    const root = path.join(process.cwd(), "..");
    const uploadsDir = path.join(root, "uploads");
    await mkdir(uploadsDir, { recursive: true });

    const dest = path.join(uploadsDir, `${reportId}${ext}`);
    await writeFile(dest, buf);

    // Run the extract -> measure -> synthesize pipeline detached so the request returns fast.
    // Pass the original filename so the report records it (and stays dedupe-able by name).
    const py = spawn(PYTHON_BIN, ["-m", "src.pipeline", dest, reportId, file.name], {
      cwd: root,
      detached: true,
      stdio: "ignore",
    });
    py.unref();

    return NextResponse.json({
      report_id: reportId,
      filename: file.name,
      status: replacing ? "updating" : "processing",
    });
  } catch (error) {
    console.error("Upload failed:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Report } from "@/lib/types";

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  processing: { text: "Extracting… (~90s)", cls: "bg-amber-100 text-amber-700 border-amber-200" },
  updating: { text: "Updating… (~90s)", cls: "bg-amber-100 text-amber-700 border-amber-200" },
  extracted: { text: "Ready · measuring growth…", cls: "bg-sky-100 text-sky-700 border-sky-200" },
  mapped: { text: "Ready", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
};

export default function HomePage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadReports = useCallback(async () => {
    try {
      const data = await fetch("/api/reports").then((r) => r.json());
      if (Array.isArray(data)) setReports(data);
    } catch {
      /* ignore transient */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReports();
    const t = setInterval(loadReports, 5000); // poll so processing reports update
    return () => clearInterval(t);
  }, [loadReports]);

  async function onUpload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setError(null);
    setInfo(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      if (fileRef.current) fileRef.current.value = "";
      if (data.status === "updating") {
        setInfo(`"${data.filename}" already exists — updating it in place (re-processes only if the content changed).`);
      }
      // Optimistic row so the user sees it immediately. Reusing the same report_id on an
      // update replaces the existing row rather than adding a duplicate.
      setReports((prev) => [
        {
          report_id: data.report_id, filename: data.filename, title: null, document_date: null, source_type: null,
          num_megatrends: null, num_nodes: null, status: data.status || "processing",
          uploaded_at: new Date().toISOString(),
        },
        ...prev.filter((r) => r.report_id !== data.report_id),
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-8 p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
        <p className="mt-1 text-sm text-slate-600">
          Upload a report (PPTX or PDF). TrendLens extracts its megatrends → subtrends → products,
          ingredients, behaviours &amp; psychographics, then measures what&apos;s growing in Google Trends.
        </p>
      </div>

      {/* Upload */}
      <form onSubmit={onUpload} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".pptx,.pdf"
            className="block text-sm text-slate-600 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-200 file:px-4 file:py-2 file:text-sm file:font-medium file:text-slate-800 hover:file:bg-slate-300"
          />
          <button
            type="submit"
            disabled={uploading}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {uploading ? "Uploading…" : "Upload & analyze"}
          </button>
          <span className="text-xs text-slate-500">Extraction takes ~1–2 min; Trends growth fills in after.</span>
        </div>
        {error && <div className="mt-3 text-sm text-rose-600">{error}</div>}
        {info && <div className="mt-3 text-sm text-sky-600">{info}</div>}
      </form>

      {/* Reports list */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="font-semibold text-slate-900">Uploaded reports</h2>
        </div>
        {loading ? (
          <div className="p-10 text-center text-slate-500">Loading…</div>
        ) : reports.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <div className="mb-2 text-3xl">▣</div>
            No reports yet — upload a PPTX or PDF to begin.
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {reports.map((r) => {
              const status = STATUS_LABEL[r.status ?? "processing"] ?? STATUS_LABEL.processing;
              const clickable = r.status === "mapped" || r.status === "extracted";
              const inner = (
                <div className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-slate-50">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-medium text-slate-900">{r.title || r.filename}</span>
                      {r.document_date && (
                        <span
                          title="Date the report states about itself (coverage period or publication date)"
                          className="shrink-0 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600"
                        >
                          🗓 {r.document_date}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-slate-500">
                      {r.filename}
                      {r.num_megatrends != null && ` · ${r.num_megatrends} megatrends`}
                      {` · ${new Date(r.uploaded_at).toLocaleString()}`}
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium ${status.cls}`}>
                    {status.text}
                  </span>
                </div>
              );
              return clickable ? (
                <Link key={r.report_id} href={`/report/${r.report_id}`}>{inner}</Link>
              ) : (
                <div key={r.report_id} className="opacity-70">{inner}</div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

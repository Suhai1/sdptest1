"use client";

import { useRef, useState } from "react";
import type { RepoSummary } from "./types";

/** commit-graph mark used in the sidebar header */
const LogoMark = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    className={className}
  >
    <circle cx="6" cy="6" r="2.2" />
    <circle cx="6" cy="18" r="2.2" />
    <circle cx="18" cy="12" r="2.2" />
    <path d="M6 8.2v7.6" />
    <path d="M8.2 6h1.3c3.5 0 5.3 6 6.3 6" />
  </svg>
);

const statusChip = (r: RepoSummary) => {
  if (r.status === "ready") return <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-400">ready</span>;
  if (r.status === "error") return <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-medium text-rose-400">error</span>;
  return <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-400">{r.phase ?? "loading"}…</span>;
};

export default function RepoSidebar({
  repos,
  selectedId,
  onSelect,
  onChanged,
}: {
  repos: RepoSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onChanged: () => void;
}) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const post = async (init: RequestInit) => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/repos", { method: "POST", ...init });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setUrl("");
      if (fileRef.current) fileRef.current.value = "";
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const addUrl = () => {
    if (url.trim()) {
      void post({
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
    }
  };

  const addFile = () => {
    const f = fileRef.current?.files?.[0];
    if (!f) return;
    const fd = new FormData();
    fd.append("file", f);
    fd.append("name", f.name.replace(/\.zip$/i, ""));
    void post({ body: fd });
  };

  const del = async (r: RepoSummary) => {
    if (!window.confirm(`Delete "${r.name}"? The clone and cached metrics will be removed.`)) return;
    await fetch(`/api/repos/${r.id}`, { method: "DELETE" });
    onChanged();
  };

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-neutral-800 bg-neutral-950">
      <div className="flex items-center gap-2.5 border-b border-neutral-800 px-4 py-3.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/30">
          <LogoMark className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold leading-none tracking-tight">RAT</h1>
          <p className="mt-1 truncate text-[11px] text-neutral-500">Repository Analysis Tool</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {repos.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-neutral-500">
            No repositories yet. Add one below by URL or zip upload.
          </p>
        )}
        {repos.map((r) => (
          <div
            key={r.id}
            onClick={() => onSelect(r.id)}
            className={`group cursor-pointer rounded-lg px-3 py-2.5 ${
              r.id === selectedId ? "bg-neutral-800/80 ring-1 ring-neutral-700" : "hover:bg-neutral-900"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium">{r.name}</span>
              <span className="flex items-center gap-1.5">
                {statusChip(r)}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void del(r);
                  }}
                  className="hidden text-neutral-500 hover:text-rose-400 group-hover:block"
                  title="delete repository"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 6h18M8 6V4h8v2m1 0v14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V6h10z" />
                  </svg>
                </button>
              </span>
            </div>
            <div className="mt-0.5 truncate text-[11px] text-neutral-500">
              {r.source.type === "url" ? r.source.url : "zip upload"}
            </div>
            {r.status === "ready" && (
              <div className="mt-0.5 text-[11px] text-neutral-400">
                {r.commitCount} commits · {r.head?.slice(0, 8)}
              </div>
            )}
            {r.status === "error" && (
              <div className="mt-0.5 truncate text-[11px] text-rose-400" title={r.error}>
                {r.error}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="space-y-3 border-t border-neutral-800 p-4">
        <div>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-neutral-500">
            Clone from URL
          </label>
          <div className="flex gap-1.5">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addUrl()}
              placeholder="https://github.com/owner/repo.git"
              className="min-w-0 flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-xs outline-none placeholder:text-neutral-600 focus:border-blue-500"
            />
            <button
              onClick={addUrl}
              disabled={busy || !url.trim()}
              className="rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-medium hover:bg-blue-500 disabled:opacity-40"
            >
              Add
            </button>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-neutral-500">
            Upload zip (with .git)
          </label>
          <div className="flex gap-1.5">
            <input
              ref={fileRef}
              type="file"
              accept=".zip,application/zip"
              className="min-w-0 flex-1 text-[11px] text-neutral-400 file:mr-2 file:rounded file:border-0 file:bg-neutral-800 file:px-2 file:py-1 file:text-xs file:text-neutral-200"
            />
            <button
              onClick={addFile}
              disabled={busy}
              className="rounded-md bg-neutral-700 px-2.5 py-1.5 text-xs font-medium hover:bg-neutral-600 disabled:opacity-40"
            >
              Upload
            </button>
          </div>
        </div>
        {err && <p className="text-[11px] text-rose-400">{err}</p>}
      </div>
    </aside>
  );
}

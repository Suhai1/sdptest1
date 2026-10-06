"use client";

import { useEffect, useState } from "react";
import type { CommitRow } from "./types";

const LIMIT = 50;

export default function CommitPicker({
  repoId,
  initial,
  onApply,
  onClose,
}: {
  repoId: string;
  initial: string[];
  onApply: (hashes: string[]) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [commits, setCommits] = useState<CommitRow[]>([]);
  const [total, setTotal] = useState(0);
  const [sel, setSel] = useState<Set<string>>(new Set(initial));
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/repos/${repoId}/commits?offset=${offset}&limit=${LIMIT}&q=${encodeURIComponent(q)}`
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        if (!cancel) {
          setCommits(data.commits ?? []);
          setTotal(data.total ?? 0);
          setErr(null);
        }
      } catch (e) {
        if (!cancel) setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancel = true;
    };
  }, [repoId, offset, q]);

  const toggle = (hash: string) =>
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(hash)) next.delete(hash);
      else next.add(hash);
      return next;
    });

  const visibleAll = commits.length > 0 && commits.every((c) => sel.has(c.hash));
  const toggleVisible = () =>
    setSel((prev) => {
      const next = new Set(prev);
      if (visibleAll) commits.forEach((c) => next.delete(c.hash));
      else commits.forEach((c) => next.add(c.hash));
      return next;
    });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-xl border border-neutral-800 bg-neutral-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-neutral-800 p-3">
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOffset(0);
            }}
            placeholder="Search commit message…"
            className="min-w-0 flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm outline-none placeholder:text-neutral-600 focus:border-blue-500"
          />
          <button className="rounded-md bg-neutral-800 px-3 py-1.5 text-xs hover:bg-neutral-700" onClick={toggleVisible}>
            {visibleAll ? "Deselect page" : "Select page"}
          </button>
          <button className="rounded-md px-2 py-1.5 text-xs text-neutral-400 hover:text-neutral-200" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {err && <p className="p-3 text-xs text-rose-400">{err}</p>}
          {commits.map((c) => (
            <label
              key={c.hash}
              className="flex cursor-pointer items-start gap-3 border-b border-neutral-900 px-3 py-2 hover:bg-neutral-900/60"
            >
              <input
                type="checkbox"
                checked={sel.has(c.hash)}
                onChange={() => toggle(c.hash)}
                className="mt-0.5 accent-blue-500"
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <code className="text-xs text-blue-400">{c.hash.slice(0, 8)}</code>
                  <span className="text-[11px] text-neutral-500">
                    {new Date(c.date * 1000).toISOString().slice(0, 10)} · {c.author}
                  </span>
                </span>
                <span className="mt-0.5 block truncate text-xs text-neutral-300">{c.subject}</span>
              </span>
            </label>
          ))}
          {!err && commits.length === 0 && (
            <p className="p-6 text-center text-xs text-neutral-500">No commits match.</p>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-neutral-800 p-3">
          <button
            className="rounded-md bg-neutral-800 px-2.5 py-1 text-xs hover:bg-neutral-700 disabled:opacity-40"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - LIMIT))}
          >
            Prev
          </button>
          <span className="text-[11px] text-neutral-500">
            {total === 0 ? 0 : offset + 1}–{Math.min(offset + LIMIT, total)} of {total}
          </span>
          <button
            className="rounded-md bg-neutral-800 px-2.5 py-1 text-xs hover:bg-neutral-700 disabled:opacity-40"
            disabled={offset + LIMIT >= total}
            onClick={() => setOffset(offset + LIMIT)}
          >
            Next
          </button>
          <span className="ml-auto text-xs text-neutral-400">{sel.size} selected</span>
          <button className="rounded-md px-2.5 py-1 text-xs text-neutral-400 hover:text-neutral-200" onClick={() => setSel(new Set())}>
            Clear
          </button>
          <button
            className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium hover:bg-blue-500"
            onClick={() => onApply([...sel])}
          >
            Apply selection
          </button>
        </div>
      </div>
    </div>
  );
}

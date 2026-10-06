"use client";

import { useMemo, useState } from "react";
import type { MetricsResponse } from "./types";

const PALETTE = ["#60a5fa", "#f472b6", "#34d399", "#fbbf24", "#a78bfa", "#f87171", "#22d3ee", "#84cc16"];
const OTHER = "#6b7280";

/** compact number format: 46377 -> "46.4k", 1121111 -> "1.1M" */
function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (abs >= 10_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(Math.round(n * 100) / 100);
}

/** fraction -> "97.4%" */
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

const FolderIcon = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    className="shrink-0 text-blue-400/80"
  >
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
  </svg>
);

const FileIcon = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    className="shrink-0 text-neutral-500"
  >
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" />
    <path d="M14 2v6h6" />
  </svg>
);

function Card({ label, value, tone, title }: { label: string; value: string; tone?: string; title?: string }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-2.5" title={title}>
      <div className="text-[10px] font-medium uppercase tracking-wide text-neutral-500">{label}</div>
      <div className={`mt-0.5 font-mono text-lg font-semibold ${tone ?? "text-neutral-100"}`}>{value}</div>
    </div>
  );
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const w = max > 0 ? Math.max(1.5, (value / max) * 100) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
      <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${w}%`, background: color }} />
    </div>
  );
}

const colorAt = (i: number) => PALETTE[i % PALETTE.length];
const MAX_AUTHOR_ROWS = 50;
const MAX_CHILD_ROWS = 2000;

type SortKey = "name" | "added" | "removed" | "growth" | "churn" | "modifications" | "modificationFrequency";
type TypeFilter = "all" | "dir" | "file";

const TYPE_TABS: [TypeFilter, string][] = [
  ["all", "All"],
  ["dir", "Folders"],
  ["file", "Files"],
];

/** "Alan Wang" -> "AW", "cjson" -> "CJ" */
const initials = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
};

export default function MetricsPanel({
  data,
  loading,
  onNavigate,
}: {
  data: MetricsResponse | null;
  loading: boolean;
  onNavigate: (path: string) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("churn");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  const children = useMemo(() => {
    const base = data?.children ?? [];
    const filtered = typeFilter === "all" ? base : base.filter((c) => c.type === typeFilter);
    return [...filtered].sort((a, b) => {
      const cmp = sortKey === "name" ? a.name.localeCompare(b.name) : a[sortKey] - b[sortKey];
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir, typeFilter]);

  if (!data) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-neutral-500">
        {loading ? "Computing metrics…" : "No metrics available."}
      </div>
    );
  }

  const m = data.metrics;
  const authors = data.authors;
  const top = authors.slice(0, 7);
  const rest = authors.slice(7);
  const restOwnership = rest.reduce((s, a) => s + a.ownership, 0);
  const maxChurn = authors.length > 0 ? authors[0].churn : 0; // already sorted by churn desc
  const shownAuthors = authors.slice(0, MAX_AUTHOR_ROWS);
  const totalChildren = data.children ?? [];
  const dirCount = totalChildren.filter((c) => c.type === "dir").length;
  const fileCount = totalChildren.length - dirCount;
  const shownChildren = children.slice(0, MAX_CHILD_ROWS);
  const maxChildChurn = children.reduce((s, c) => Math.max(s, c.churn), 0);

  const sortTh = (label: string, key: SortKey, cls: string) => (
    <th className={cls}>
      <button
        onClick={() => toggleSort(key)}
        className="inline-flex items-center gap-1 uppercase hover:text-neutral-300"
        title={`sort by ${label}`}
      >
        {label}
        {sortKey === key && <span className="text-blue-400">{sortDir === "asc" ? "▲" : "▼"}</span>}
      </button>
    </th>
  );

  return (
    <div className={`space-y-5 p-4 transition-opacity ${loading ? "opacity-60" : ""}`}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
        <Card label="Commits" value={fmtNum(m.commitCount)} title="|H| — commits in the current selection" />
        <Card label="Added" value={fmtNum(m.added)} tone="text-emerald-400" title="l+ summed over H (subtree sum for directories)" />
        <Card label="Removed" value={fmtNum(m.removed)} tone="text-rose-400" title="l− summed over H (subtree sum for directories)" />
        <Card
          label="Growth"
          value={fmtNum(m.growth)}
          tone={m.growth >= 0 ? "text-emerald-400" : "text-rose-400"}
          title="l+ − l− (net line growth)"
        />
        <Card label="Churn" value={fmtNum(m.churn)} tone="text-amber-400" title="l+ + l− (total line activity)" />
        <Card label="Modifications" value={fmtNum(m.modifications)} title="commits in H that touched this object (churn > 0)" />
        <Card label="Mod Freq" value={pct(m.modificationFrequency)} title="modifications / |H|" />
        <Card label="Churn Rate" value={fmtNum(m.churnRate)} title="churn / |H| (average churn per commit)" />
      </div>

      <section className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Author ownership</h2>
          <span className="text-[11px] text-neutral-500">share of churn in the current selection</span>
        </div>
        {authors.length === 0 ? (
          <p className="py-6 text-center text-xs text-neutral-500">No author modifications in this selection.</p>
        ) : (
          <div className="mt-3 space-y-3">
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-neutral-800">
              {top.map((a, i) => (
                <div
                  key={a.id}
                  className="transition-[width] duration-300"
                  style={{ width: `${a.ownership * 100}%`, background: colorAt(i) }}
                  title={`${a.name} — ${pct(a.ownership)} of churn`}
                />
              ))}
              {rest.length > 0 && (
                <div
                  className="transition-[width] duration-300"
                  style={{ width: `${restOwnership * 100}%`, background: OTHER }}
                  title={`other ${rest.length} authors — ${pct(restOwnership)} of churn`}
                />
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-3 text-[10px] font-medium uppercase tracking-wide text-neutral-500">
                <span className="w-5 shrink-0" />
                <span className="w-40 shrink-0">Author</span>
                <span className="min-w-0 flex-1">Share</span>
                <span className="w-16 shrink-0 text-right">Churn</span>
                <span className="w-16 shrink-0 text-right">Mods</span>
                <span className="w-14 shrink-0 text-right">Own.</span>
              </div>
              {shownAuthors.map((a, i) => (
                <div key={a.id} className="flex items-center gap-3">
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[9px] font-semibold"
                    style={{
                      background: `${i < 7 ? colorAt(i) : OTHER}22`,
                      color: i < 7 ? colorAt(i) : "#9ca3af",
                    }}
                  >
                    {initials(a.name)}
                  </span>
                  <span className="w-40 shrink-0 truncate text-xs text-neutral-200" title={a.keys.join("\n")}>
                    {a.name}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Bar value={a.churn} max={maxChurn} color={i < 7 ? colorAt(i) : OTHER} />
                  </div>
                  <span className="w-16 shrink-0 text-right font-mono text-xs text-neutral-300">{fmtNum(a.churn)}</span>
                  <span className="w-16 shrink-0 text-right text-[11px] text-neutral-500">{fmtNum(a.modifications)}</span>
                  <span className="w-14 shrink-0 text-right font-mono text-xs text-neutral-300">{pct(a.ownership)}</span>
                </div>
              ))}
              {authors.length > shownAuthors.length && (
                <p className="pt-1 text-[11px] text-neutral-500">
                  +{authors.length - shownAuthors.length} more authors not shown
                </p>
              )}
            </div>
          </div>
        )}
      </section>

      {data.kind === "dir" && (
        <section className="rounded-lg border border-neutral-800 bg-neutral-900/40">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Contents</h2>
              <span className="text-[11px] text-neutral-500">
                {dirCount} folders · {fileCount} files — click a row to drill down
              </span>
            </div>
            <div className="flex items-center gap-0.5 rounded-md bg-neutral-950 p-0.5 ring-1 ring-neutral-800">
              {TYPE_TABS.map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setTypeFilter(value)}
                  className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                    typeFilter === value
                      ? "bg-neutral-800 text-neutral-100"
                      : "text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {children.length === 0 ? (
            <p className="py-6 text-center text-xs text-neutral-500">
              {totalChildren.length === 0
                ? "No file activity in this selection."
                : `No ${typeFilter === "dir" ? "folders" : "files"} in this selection.`}
            </p>
          ) : (
            <div className="mt-2 overflow-x-auto pb-2">
              <table className="w-full table-fixed text-xs">
                <thead>
                  <tr className="border-b border-neutral-800 text-[10px] font-medium uppercase tracking-wide text-neutral-500">
                    {sortTh("Name", "name", "px-4 py-2 text-left")}
                    {sortTh("Added", "added", "w-20 px-2 py-2 text-right")}
                    {sortTh("Removed", "removed", "w-20 px-2 py-2 text-right")}
                    {sortTh("Growth", "growth", "w-20 px-2 py-2 text-right")}
                    {sortTh("Churn", "churn", "w-44 px-2 py-2 text-right")}
                    {sortTh("Mods", "modifications", "w-16 px-2 py-2 text-right")}
                    {sortTh("Mod Freq", "modificationFrequency", "w-20 px-4 py-2 text-right")}
                  </tr>
                </thead>
                <tbody>
                  {shownChildren.map((c) => (
                    <tr
                      key={c.path}
                      onClick={() => onNavigate(c.path)}
                      className="cursor-pointer border-b border-neutral-900 last:border-0 hover:bg-neutral-800/50"
                    >
                      <td className="overflow-hidden px-4 py-1.5">
                        <span className="flex items-center gap-2">
                          {c.type === "dir" ? <FolderIcon /> : <FileIcon />}
                          <span className="min-w-0 truncate text-neutral-200" title={c.path}>
                            {c.name}
                          </span>
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-emerald-400">{fmtNum(c.added)}</td>
                      <td className="px-2 py-1.5 text-right font-mono text-rose-400">{fmtNum(c.removed)}</td>
                      <td className={`px-2 py-1.5 text-right font-mono ${c.growth >= 0 ? "text-neutral-200" : "text-rose-400"}`}>
                        {fmtNum(c.growth)}
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="ml-auto flex w-full max-w-40 items-center gap-2">
                          <span className="w-14 shrink-0 text-right font-mono text-neutral-200">{fmtNum(c.churn)}</span>
                          <div className="min-w-0 flex-1">
                            <Bar value={c.churn} max={maxChildChurn} color="#60a5fa" />
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-neutral-300">{fmtNum(c.modifications)}</td>
                      <td className="px-4 py-1.5 text-right font-mono text-neutral-300">{pct(c.modificationFrequency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {children.length > shownChildren.length && (
                <p className="px-4 pt-2 text-[11px] text-neutral-500">
                  +{children.length - shownChildren.length} more entries not shown — narrow the filters to see them
                </p>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

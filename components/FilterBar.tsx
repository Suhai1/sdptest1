"use client";

import type { AuthorsResponse, FiltersState } from "./types";

const PRESETS: [string, number | null][] = [
  ["All", null],
  ["1Y", 365],
  ["6M", 182],
  ["90D", 90],
  ["30D", 30],
];

const isoDate = (unix: number) => new Date(unix * 1000).toISOString().slice(0, 10);
const dayStart = (s: string) => Math.floor(new Date(`${s}T00:00:00`).getTime() / 1000);
const dayEnd = (s: string) => Math.floor(new Date(`${s}T23:59:59`).getTime() / 1000) + 1;

export function authorOptions(authors: AuthorsResponse | null) {
  if (!authors) return [] as { id: string; name: string; commits: number }[];
  const countByKey = new Map(authors.authors.map((a) => [a.key, a.commits]));
  const covered = new Set(authors.groups.flatMap((g) => g.keys));
  const opts = authors.groups.map((g) => ({
    id: g.id,
    name: g.name,
    commits: g.keys.reduce((s, k) => s + (countByKey.get(k) ?? 0), 0),
  }));
  for (const a of authors.authors) {
    if (!covered.has(a.key)) opts.push({ id: a.key, name: a.name, commits: a.commits });
  }
  return opts.sort((a, b) => b.commits - a.commits);
}

export default function FilterBar({
  authors,
  filters,
  onChange,
  onOpenCommits,
  onClear,
}: {
  authors: AuthorsResponse | null;
  filters: FiltersState;
  onChange: (f: FiltersState) => void;
  onOpenCommits: () => void;
  onClear: () => void;
}) {
  const now = Math.floor(Date.now() / 1000);
  const opts = authorOptions(authors);
  const commitsCount = filters.commits?.length ?? 0;
  const hasFilters = !!(filters.author || filters.since || filters.until || commitsCount);

  const setPreset = (days: number | null) =>
    onChange({
      ...filters,
      since: days ? now - days * 86400 : undefined,
      until: undefined,
      commits: null,
    });

  const chip = (active: boolean) =>
    `rounded-md px-2 py-1 text-xs font-medium ${
      active ? "bg-blue-600 text-white" : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
    }`;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-neutral-800 bg-neutral-950 px-4 py-2.5">
      <select
        value={filters.author ?? ""}
        onChange={(e) => onChange({ ...filters, author: e.target.value || null })}
        className="max-w-56 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-xs outline-none focus:border-blue-500"
        title="filter by author"
      >
        <option value="">All authors</option>
        {opts.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name} ({o.commits})
          </option>
        ))}
      </select>

      <div className="flex items-center gap-1">
        {PRESETS.map(([label, days]) => (
          <button key={label} className={chip(false)} onClick={() => setPreset(days)}>
            {label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1 text-xs text-neutral-400">
        <input
          type="date"
          value={filters.since ? isoDate(filters.since) : ""}
          onChange={(e) =>
            onChange({ ...filters, since: e.target.value ? dayStart(e.target.value) : undefined, commits: null })
          }
          className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs outline-none focus:border-blue-500"
          title="commits from (inclusive)"
        />
        <span>–</span>
        <input
          type="date"
          value={filters.until ? isoDate(filters.until - 1) : ""}
          onChange={(e) =>
            onChange({ ...filters, until: e.target.value ? dayEnd(e.target.value) : undefined, commits: null })
          }
          className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs outline-none focus:border-blue-500"
          title="commits until (inclusive)"
        />
      </div>

      <button className={chip(commitsCount > 0)} onClick={onOpenCommits} title="pick a specific set of commits">
        {commitsCount > 0 ? `${commitsCount} commits selected` : "Pick commits…"}
      </button>

      {hasFilters && (
        <button
          onClick={onClear}
          className="ml-auto rounded-md px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}

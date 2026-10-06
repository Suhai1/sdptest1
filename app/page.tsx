"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import CommitPicker from "@/components/CommitPicker";
import FilterBar from "@/components/FilterBar";
import MetricsPanel from "@/components/MetricsPanel";
import RepoSidebar from "@/components/RepoSidebar";
import type { AuthorsResponse, FiltersState, MetricsResponse, RepoSummary } from "@/components/types";

const PHASE_TEXT: Record<string, string> = {
  cloning: "Cloning repository…",
  extracting: "Extracting archive…",
  parsing: "Parsing git history… (large repos can take a few minutes)",
};

export default function Home() {
  const [repos, setRepos] = useState<RepoSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [path, setPath] = useState("");
  const [filters, setFilters] = useState<FiltersState>({ author: null, commits: null });
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [authors, setAuthors] = useState<AuthorsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const loadRepos = useCallback(async () => {
    try {
      const res = await fetch("/api/repos");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setRepos((data.repos ?? []) as RepoSummary[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void loadRepos();
  }, [loadRepos]);

  // poll while any repository is still ingesting
  useEffect(() => {
    if (!repos.some((r) => r.status === "loading")) return;
    const t = setInterval(() => void loadRepos(), 1500);
    return () => clearInterval(t);
  }, [repos, loadRepos]);

  // keep a valid selection: auto-select the first ready repo
  useEffect(() => {
    if (selectedId && repos.some((r) => r.id === selectedId)) return;
    setSelectedId(repos.find((r) => r.status === "ready")?.id ?? null);
    setPath("");
    setFilters({ author: null, commits: null });
    setMetrics(null);
    setAuthors(null);
    setPickerOpen(false);
  }, [repos, selectedId]);

  const selectRepo = (id: string) => {
    if (id === selectedId) return;
    setSelectedId(id);
    setPath("");
    setFilters({ author: null, commits: null });
    setMetrics(null);
    setAuthors(null);
    setPickerOpen(false);
    setError(null);
  };

  const selected = repos.find((r) => r.id === selectedId) ?? null;
  const ready = selected?.status === "ready";

  // author list depends only on the repo (it changes on ingest / merges)
  useEffect(() => {
    if (!selectedId || !ready) return;
    let cancel = false;
    (async () => {
      try {
        const res = await fetch(`/api/repos/${selectedId}/authors`);
        if (res.ok && !cancel) setAuthors((await res.json()) as AuthorsResponse);
      } catch {
        // dropdown simply stays as-is on failure
      }
    })();
    return () => {
      cancel = true;
    };
  }, [selectedId, ready]);

  // fetch metrics whenever repo / path / filters change
  useEffect(() => {
    if (!selectedId || !ready) return;
    let cancel = false;
    const qs = new URLSearchParams();
    if (path) qs.set("path", path);
    if (filters.author) qs.set("author", filters.author);
    if (filters.since !== undefined && filters.since > 0) qs.set("since", String(filters.since));
    if (filters.until !== undefined && filters.until > 0) qs.set("until", String(filters.until));
    if (filters.commits?.length) qs.set("commits", filters.commits.join(","));

    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(`/api/repos/${selectedId}/metrics?${qs.toString()}`);
        const mData = await res.json();
        if (cancel) return;
        if (!res.ok) throw new Error(mData.error ?? `HTTP ${res.status}`);
        setMetrics(mData as MetricsResponse);
      } catch (e) {
        if (!cancel) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [selectedId, ready, path, filters]);

  const crumbs = path
    ? path.split("/").map((seg, i, arr) => ({ seg, path: arr.slice(0, i + 1).join("/") }))
    : [];

  return (
    <div className="flex h-screen overflow-hidden">
      <RepoSidebar
        repos={repos}
        selectedId={selectedId}
        onSelect={selectRepo}
        onChanged={() => void loadRepos()}
      />

      <main className="flex min-w-0 flex-1 flex-col bg-neutral-950">
        <header className="flex items-center gap-3 border-b border-neutral-800 px-4 py-2.5">
          <nav className="flex min-w-0 items-center gap-1 text-xs">
            {selected ? (
              <>
                <button
                  onClick={() => setPath("")}
                  className={`shrink-0 rounded px-1.5 py-0.5 font-medium hover:bg-neutral-800 ${
                    path ? "text-blue-400" : "text-neutral-100"
                  }`}
                  title="repository root"
                >
                  {selected.name}
                </button>
                {crumbs.map((c, i) => (
                  <Fragment key={c.path}>
                    <span className="shrink-0 text-neutral-600">/</span>
                    <button
                      onClick={() => setPath(c.path)}
                      className={`truncate rounded px-1.5 py-0.5 hover:bg-neutral-800 ${
                        i === crumbs.length - 1 ? "text-neutral-100" : "text-blue-400"
                      }`}
                    >
                      {c.seg}
                    </button>
                  </Fragment>
                ))}
              </>
            ) : (
              <span className="text-neutral-500">no repository selected</span>
            )}
          </nav>
          <span className="ml-auto flex shrink-0 items-center gap-3 text-[11px] text-neutral-500">
            {loading && <span className="animate-pulse text-blue-400">computing…</span>}
            {ready && (
              <span>
                {selected?.commitCount} commits · {selected?.head?.slice(0, 8)}
              </span>
            )}
          </span>
        </header>

        {ready && (
          <FilterBar
            authors={authors}
            filters={filters}
            onChange={setFilters}
            onOpenCommits={() => setPickerOpen(true)}
            onClear={() => setFilters({ author: null, commits: null })}
          />
        )}

        {error && (
          <div className="flex items-center gap-3 border-b border-rose-900/60 bg-rose-950/40 px-4 py-2 text-xs text-rose-300">
            <span className="min-w-0 flex-1 truncate" title={error}>
              {error}
            </span>
            <button onClick={() => setError(null)} className="shrink-0 rounded px-2 py-0.5 hover:bg-rose-900/40">
              dismiss
            </button>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {repos.length === 0 ? (
            <div className="flex h-full items-center justify-center p-8">
              <div className="max-w-md text-center">
                <h2 className="text-sm font-semibold text-neutral-200">No repositories yet</h2>
                <p className="mt-1 text-xs leading-relaxed text-neutral-500">
                  Add one from the sidebar: paste a clone URL (the clone runs in the background), or
                  upload a zip that contains the repository&apos;s .git directory.
                </p>
              </div>
            </div>
          ) : !selected ? (
            <div className="flex h-full items-center justify-center text-xs text-neutral-500">
              Select a repository from the sidebar.
            </div>
          ) : selected.status === "loading" ? (
            <div className="flex h-full items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-700 border-t-blue-500" />
                <p className="text-xs text-neutral-400">
                  Loading <span className="font-medium text-neutral-200">{selected.name}</span>
                </p>
                <p className="text-[11px] text-neutral-500">
                  {PHASE_TEXT[selected.phase ?? ""] ?? selected.phase ?? "working…"}
                </p>
              </div>
            </div>
          ) : selected.status === "error" ? (
            <div className="flex h-full items-center justify-center p-8">
              <div className="max-w-md rounded-lg border border-rose-900/60 bg-rose-950/30 p-4 text-center">
                <h2 className="text-sm font-semibold text-rose-300">Failed to ingest {selected.name}</h2>
                <p className="mt-1 break-words text-xs text-rose-400/80">{selected.error}</p>
                <p className="mt-2 text-[11px] text-neutral-500">
                  Delete the repository from the sidebar and try again.
                </p>
              </div>
            </div>
          ) : (
            <MetricsPanel data={metrics} loading={loading} onNavigate={setPath} />
          )}
        </div>
      </main>

      {pickerOpen && selectedId && (
        <CommitPicker
          repoId={selectedId}
          initial={filters.commits ?? []}
          onApply={(hashes) => {
            setFilters((f) => ({
              author: f.author,
              since: undefined,
              until: undefined,
              commits: hashes.length > 0 ? hashes : null,
            }));
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}

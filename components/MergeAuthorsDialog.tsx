"use client";

import { useEffect, useMemo, useState } from "react";
import type { AuthorGroup, AuthorsResponse } from "./types";

interface DraftGroup {
  name: string;
  keys: string[];
}

const MAX_LISTED = 250;

/** "Alan Wang <a@b>" -> "Alan Wang" */
const displayName = (key: string) => {
  const m = key.match(/^(.*)<[^>]+>$/);
  return m ? m[1].trim() || key : key;
};

const toDraft = (gs: AuthorGroup[]): DraftGroup[] => gs.map((g) => ({ name: g.name, keys: [...g.keys] }));

export default function MergeAuthorsDialog({
  repoId,
  onClose,
  onMerged,
}: {
  repoId: string;
  onClose: () => void;
  onMerged: () => void;
}) {
  const [data, setData] = useState<AuthorsResponse | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftGroup[] | null>(null);
  const [original, setOriginal] = useState<DraftGroup[] | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [newName, setNewName] = useState("");
  const [q, setQ] = useState("");
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // load the current identity table on open
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const res = await fetch(`/api/repos/${repoId}/authors`);
        const d = (await res.json()) as Record<string, unknown>;
        if (!res.ok) throw new Error(typeof d.error === "string" ? d.error : `HTTP ${res.status}`);
        if (cancel) return;
        const groups = Array.isArray(d.groups) ? (d.groups as AuthorGroup[]) : [];
        setData({
          authors: Array.isArray(d.authors) ? (d.authors as AuthorsResponse["authors"]) : [],
          groups,
          mailmap: typeof d.mailmap === "string" ? d.mailmap : null,
          suggestions: Array.isArray(d.suggestions) ? (d.suggestions as AuthorsResponse["suggestions"]) : [],
        });
        setDraft(toDraft(groups));
        setOriginal(toDraft(groups));
      } catch (e) {
        if (!cancel) setLoadErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancel = true;
    };
  }, [repoId]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of data?.authors ?? []) m.set(a.key, a.commits);
    return m;
  }, [data]);

  const covered = useMemo(() => new Set((draft ?? []).flatMap((g) => g.keys)), [draft]);

  const uncovered = useMemo(
    () => (data?.authors ?? []).filter((a) => !covered.has(a.key)),
    [data, covered]
  );

  const needle = q.trim().toLowerCase();
  const listed = needle
    ? uncovered.filter(
        (a) => a.name.toLowerCase().includes(needle) || a.email.toLowerCase().includes(needle)
      )
    : uncovered;
  const shown = listed.slice(0, MAX_LISTED);

  const groupCommits = (g: DraftGroup) => g.keys.reduce((s, k) => s + (counts.get(k) ?? 0), 0);

  const dirty = useMemo(() => {
    if (!draft || !original) return false;
    if (draft.length !== original.length) return true;
    return draft.some((g, i) => {
      const o = original[i];
      return g.name !== o.name || g.keys.length !== o.keys.length || g.keys.some((k, j) => k !== o.keys[j]);
    });
  }, [draft, original]);

  const toggle = (key: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const addGroup = () => {
    if (!draft || !data) return;
    const keys = data.authors.filter((a) => checked.has(a.key)).map((a) => a.key);
    if (keys.length === 0) return;
    setDraft([...draft, { name: newName.trim() || displayName(keys[0]), keys }]);
    setChecked(new Set());
    setNewName("");
  };

  const removeGroup = (index: number) => {
    if (!draft) return;
    setDraft(draft.filter((_, i) => i !== index));
  };

  const renameGroup = (index: number, name: string) => {
    if (!draft) return;
    setDraft(draft.map((g, i) => (i === index ? { ...g, name } : g)));
  };

  /** build groups from the repo's .mailmap suggestions (replaces current groups) */
  const applyMailmap = () => {
    if (!data) return;
    const byMerged = new Map<string, DraftGroup>();
    for (const s of data.suggestions) {
      let g = byMerged.get(s.mergedKey);
      if (!g) {
        g = { name: s.mergedName, keys: [] };
        byMerged.set(s.mergedKey, g);
      }
      g.keys.push(s.key);
    }
    setDraft([...byMerged.values()]);
    setChecked(new Set());
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setSaveErr(null);
    try {
      const res = await fetch(`/api/repos/${repoId}/authors/merge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ groups: draft }),
      });
      const d = (await res.json()) as Record<string, unknown>;
      if (!res.ok) throw new Error(typeof d.error === "string" ? d.error : `HTTP ${res.status}`);
      onMerged();
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl border border-neutral-800 bg-neutral-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline gap-2 border-b border-neutral-800 px-4 py-3">
          <h2 className="text-sm font-semibold text-neutral-100">Merge author identities</h2>
          <span className="min-w-0 flex-1 truncate text-[11px] text-neutral-500">
            group aliases / multiple emails of one person — applies to every metric view of this repo
          </span>
          <button className="shrink-0 rounded-md px-2 py-1 text-xs text-neutral-400 hover:text-neutral-200" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
          {loadErr && <p className="text-xs text-rose-400">{loadErr}</p>}
          {!data && !loadErr && <p className="py-8 text-center text-xs text-neutral-500">Loading authors…</p>}

          {data && draft && (
            <>
              <section>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                    Merge groups ({draft.length})
                  </h3>
                  <span className="text-[11px] text-neutral-500">rename or unmerge before saving</span>
                </div>
                {draft.length === 0 ? (
                  <p className="mt-2 rounded-md border border-dashed border-neutral-800 px-3 py-3 text-center text-[11px] text-neutral-500">
                    No merges yet — tick identities below and hit “Merge selected”.
                  </p>
                ) : (
                  <div className="mt-2 space-y-1.5">
                    {draft.map((g, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 rounded-md border border-neutral-800 bg-neutral-900/50 px-2.5 py-2"
                      >
                        <input
                          value={g.name}
                          onChange={(e) => renameGroup(i, e.target.value)}
                          className="w-40 shrink-0 rounded border border-transparent bg-transparent px-1 py-0.5 text-xs font-medium text-neutral-100 outline-none hover:border-neutral-700 focus:border-blue-500"
                          title="group display name"
                        />
                        <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                          {g.keys.map((k) => (
                            <span
                              key={k}
                              className="rounded-full bg-neutral-800 px-2 py-0.5 text-[10px] text-neutral-300"
                              title={k}
                            >
                              {displayName(k)} · {counts.get(k) ?? 0}
                            </span>
                          ))}
                        </div>
                        <span className="shrink-0 font-mono text-[11px] text-neutral-500">
                          {groupCommits(g)} commits
                        </span>
                        <button
                          onClick={() => removeGroup(i)}
                          className="shrink-0 rounded p-0.5 text-neutral-500 hover:bg-neutral-800 hover:text-rose-400"
                          title="unmerge this group"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M6 6l12 12M18 6L6 18" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {data.suggestions.length > 0 && (
                <section className="rounded-md border border-neutral-800 bg-neutral-900/40 p-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                        Mailmap suggestions
                      </h3>
                      <p className="mt-0.5 text-[11px] text-neutral-500">
                        The repository&apos;s .mailmap rewrites {data.suggestions.length} identities, e.g.{" "}
                        <span className="text-neutral-300">
                          {displayName(data.suggestions[0].key)} → {data.suggestions[0].mergedName}
                        </span>
                      </p>
                    </div>
                    <button
                      onClick={applyMailmap}
                      className="shrink-0 rounded-md bg-neutral-800 px-2.5 py-1 text-xs hover:bg-neutral-700"
                      title="replaces the current merge groups with the .mailmap-derived ones"
                    >
                      Apply mailmap groups
                    </button>
                  </div>
                </section>
              )}

              <section>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                    Raw identities ({uncovered.length} unmerged)
                  </h3>
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Filter by name or email…"
                    className="ml-auto w-48 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs outline-none placeholder:text-neutral-600 focus:border-blue-500"
                  />
                </div>
                {listed.length === 0 ? (
                  <p className="mt-2 text-center text-[11px] text-neutral-500">
                    {uncovered.length === 0 ? "Every identity is in a merge group." : "No identities match the filter."}
                  </p>
                ) : (
                  <div className="mt-2 max-h-64 overflow-y-auto rounded-md border border-neutral-800">
                    {shown.map((a) => (
                      <label
                        key={a.key}
                        className="flex cursor-pointer items-center gap-3 border-b border-neutral-900 px-3 py-1.5 last:border-0 hover:bg-neutral-900/60"
                      >
                        <input
                          type="checkbox"
                          checked={checked.has(a.key)}
                          onChange={() => toggle(a.key)}
                          className="accent-blue-500"
                        />
                        <span className="w-40 shrink-0 truncate text-xs text-neutral-200" title={a.key}>
                          {a.name}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[11px] text-neutral-500">{a.email}</span>
                        <span className="w-20 shrink-0 text-right font-mono text-[11px] text-neutral-400">
                          {a.commits} commits
                        </span>
                      </label>
                    ))}
                    {listed.length > shown.length && (
                      <p className="px-3 py-1.5 text-[11px] text-neutral-500">
                        +{listed.length - shown.length} more — refine the filter to see them
                      </p>
                    )}
                  </div>
                )}
              </section>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-neutral-800 px-4 py-3">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Group name (optional)"
            className="w-44 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-xs outline-none placeholder:text-neutral-600 focus:border-blue-500"
          />
          <button
            onClick={addGroup}
            disabled={checked.size === 0}
            className="rounded-md bg-neutral-800 px-3 py-1.5 text-xs hover:bg-neutral-700 disabled:opacity-40"
          >
            Merge selected ({checked.size})
          </button>
          <span className="min-w-0 flex-1 truncate text-[11px] text-rose-400" title={saveErr ?? undefined}>
            {saveErr}
          </span>
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="shrink-0 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium hover:bg-blue-500 disabled:opacity-40"
          >
            {saving ? "Saving…" : draft && draft.length === 0 ? "Clear all merges" : `Save merges (${draft?.length ?? 0})`}
          </button>
        </div>
      </div>
    </div>
  );
}

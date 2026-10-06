import type { AuthorMetric } from "./engine/metrics";

export interface AuthorGroup {
  id: string;
  name: string;
  keys: string[];
}

export interface MailmapEntry {
  properName: string;
  properEmail: string;
  commitName: string;
  commitEmail: string;
}

export interface MailmapSuggestion {
  key: string;
  mergedKey: string;
  mergedName: string;
  mergedEmail: string;
}

export interface GroupedAuthorMetric {
  id: string;
  name: string;
  keys: string[];
  modifications: number;
  churn: number;
  ownership: number;
}

const EMAIL_RE = /<([^>]+)>/g;
const KEY_RE = /^(.*)<([^>]+)>$/;

/**
 * Parse a .mailmap file. Supports:
 *   Proper Name <proper@mail> Commit Name <commit@mail>
 *   Proper Name <proper@mail> <commit@mail>
 *   <proper@mail> <commit@mail>
 */
export function parseMailmap(text: string): MailmapEntry[] {
  const out: MailmapEntry[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.split("#")[0].trim();
    if (!line) continue;
    const emails = [...line.matchAll(EMAIL_RE)].map((m) => m[1].trim());
    if (emails.length < 2) continue;
    const properName = line.slice(0, line.indexOf("<")).trim();
    const afterFirst = line.replace(/^[^<]*<[^>]*>/, "").trim();
    const cm = afterFirst.match(/^([^<]*)</);
    const commitName = cm ? cm[1].trim() : "";
    out.push({ properName, properEmail: emails[0], commitName, commitEmail: emails[1] });
  }
  return out;
}

/** Which raw author keys a mailmap would rewrite, and to what. */
export function applyMailmap(authors: string[], entries: MailmapEntry[]): MailmapSuggestion[] {
  const out: MailmapSuggestion[] = [];
  for (const key of authors) {
    const m = key.match(KEY_RE);
    if (!m) continue;
    const name = m[1].trim();
    const email = m[2].trim();
    const hit = entries.find(
      (e) => e.commitEmail === email && (!e.commitName || e.commitName === name)
    );
    if (!hit) continue;
    const mergedName = hit.properName || name;
    out.push({ key, mergedKey: `${mergedName} <${hit.properEmail}>`, mergedName, mergedEmail: hit.properEmail });
  }
  return out;
}

/** raw author key → merged identity (explicit groups first, then self). */
export function resolveAuthorGroups(authors: string[], groups: AuthorGroup[]) {
  const map = new Map<string, { id: string; name: string }>();
  for (const g of groups) for (const k of g.keys) map.set(k, { id: g.id, name: g.name });
  for (const a of authors) if (!map.has(a)) map.set(a, { id: a, name: a });
  return map;
}

/** collapse a raw per-author breakdown into merged identities */
export function summarizeAuthors(
  raw: AuthorMetric[],
  authors: string[],
  groups: AuthorGroup[]
): GroupedAuthorMetric[] {
  const resolve = resolveAuthorGroups(authors, groups);
  const map = new Map<string, GroupedAuthorMetric>();
  let total = 0;
  for (const r of raw) total += r.churn;
  for (const r of raw) {
    const g = resolve.get(r.author) ?? { id: r.author, name: r.author };
    let e = map.get(g.id);
    if (!e) {
      e = { id: g.id, name: g.name, keys: [], modifications: 0, churn: 0, ownership: 0 };
      map.set(g.id, e);
    }
    if (!e.keys.includes(r.author)) e.keys.push(r.author);
    e.modifications += r.modifications;
    e.churn += r.churn;
  }
  for (const e of map.values()) e.ownership = total > 0 ? e.churn / total : 0;
  return [...map.values()].sort((a, b) => b.churn - a.churn);
}

/** resolve an `author` query param (group id or raw key) to raw keys. */
export function resolveAuthorFilter(
  param: string,
  authors: string[],
  groups: AuthorGroup[]
): Set<string> | null {
  const g = groups.find((x) => x.id === param);
  if (g) return new Set(g.keys);
  if (authors.includes(param)) return new Set([param]);
  return null;
}

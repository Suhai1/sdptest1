import { authorKey, type RawCommit, type RepoLog } from "./parse";

export interface Filters {
  /** inclusive lower bound, unix seconds */
  since?: number;
  /** exclusive upper bound, unix seconds */
  until?: number;
  /** manual commit selection; when set only these hashes are in H */
  commitHashes?: Set<string>;
  /** restrict H to commits by these raw identities (merge resolution happens above) */
  authorKeys?: Set<string>;
}

export interface ObjectMetrics {
  commitCount: number;
  added: number;
  removed: number;
  growth: number;
  churn: number;
  modifications: number;
  modificationFrequency: number;
  churnRate: number;
}

export interface AuthorMetric {
  author: string;
  modifications: number;
  churn: number;
  ownership: number;
}

export interface FileStat {
  path: string;
  added: number;
  removed: number;
  churn: number;
  modifications: number;
}

export interface TreeNode {
  name: string;
  path: string;
  type: "dir" | "file";
  children?: TreeNode[];
}

export function filterCommits(log: RepoLog, f: Filters): RawCommit[] {
  return log.commits.filter((c) => {
    if (f.commitHashes && !f.commitHashes.has(c.hash)) return false;
    if (f.authorKeys && !f.authorKeys.has(authorKey(c.authorName, c.authorEmail))) return false;
    if (f.since !== undefined && c.date < f.since) return false;
    if (f.until !== undefined && c.date >= f.until) return false;
    return true;
  });
}

/** true when file path p lives inside directory d ("" = repo root) */
export function isUnder(p: string, d: string): boolean {
  return d === "" ? true : p.startsWith(d + "/");
}

/** summed l+/l- of one commit for a file (exact) or directory (subtree) */
function objectDelta(c: RawCommit, target: string, kind: "file" | "dir") {
  let added = 0;
  let removed = 0;
  for (const [p, d] of c.files) {
    if (kind === "file" ? p === target : isUnder(p, target)) {
      added += d.added;
      removed += d.removed;
    }
  }
  return { added, removed };
}

export function computeMetrics(
  log: RepoLog,
  filters: Filters,
  target: string,
  kind: "file" | "dir"
): ObjectMetrics {
  const commits = filterCommits(log, filters);
  let added = 0;
  let removed = 0;
  let modifications = 0;
  for (const c of commits) {
    const d = objectDelta(c, target, kind);
    if (d.added + d.removed > 0) modifications++;
    added += d.added;
    removed += d.removed;
  }
  const n = commits.length;
  return {
    commitCount: n,
    added,
    removed,
    growth: added - removed,
    churn: added + removed,
    modifications,
    modificationFrequency: n > 0 ? modifications / n : 0,
    churnRate: n > 0 ? (added + removed) / n : 0,
  };
}

export function authorBreakdown(
  log: RepoLog,
  filters: Filters,
  target: string,
  kind: "file" | "dir"
): AuthorMetric[] {
  const commits = filterCommits(log, filters);
  const map = new Map<string, { modifications: number; churn: number }>();
  let totalChurn = 0;
  for (const c of commits) {
    const d = objectDelta(c, target, kind);
    const churn = d.added + d.removed;
    totalChurn += churn;
    if (churn === 0) continue;
    const k = authorKey(c.authorName, c.authorEmail);
    const e = map.get(k) ?? { modifications: 0, churn: 0 };
    e.modifications++;
    e.churn += churn;
    map.set(k, e);
  }
  return [...map.entries()]
    .map(([author, e]) => ({
      author,
      modifications: e.modifications,
      churn: e.churn,
      ownership: totalChurn > 0 ? e.churn / totalChurn : 0,
    }))
    .sort((a, b) => b.churn - a.churn);
}

/** hottest files (by churn) over the filtered commit set */
export function topFiles(log: RepoLog, filters: Filters, limit = 20): FileStat[] {
  const commits = filterCommits(log, filters);
  const map = new Map<string, FileStat>();
  for (const c of commits) {
    for (const [p, d] of c.files) {
      let e = map.get(p);
      if (!e) {
        e = { path: p, added: 0, removed: 0, churn: 0, modifications: 0 };
        map.set(p, e);
      }
      e.added += d.added;
      e.removed += d.removed;
      e.churn += d.added + d.removed;
      if (d.added + d.removed > 0) e.modifications++;
    }
  }
  return [...map.values()].sort((a, b) => b.churn - a.churn).slice(0, limit);
}

/** H[F] ∪ H[D] as a tree rooted at "" */
export function buildTree(log: RepoLog): TreeNode {
  const root: TreeNode = { name: "", path: "", type: "dir", children: [] };
  const dirs = new Map<string, TreeNode>([["", root]]);

  const ensureDir = (path: string): TreeNode => {
    const cached = dirs.get(path);
    if (cached) return cached;
    const i = path.lastIndexOf("/");
    const parent = ensureDir(i < 0 ? "" : path.slice(0, i));
    const node: TreeNode = {
      name: i < 0 ? path : path.slice(i + 1),
      path,
      type: "dir",
      children: [],
    };
    dirs.set(path, node);
    parent.children!.push(node);
    return node;
  };

  for (const c of log.commits) {
    for (const p of c.files.keys()) {
      const i = p.lastIndexOf("/");
      const parent = ensureDir(i < 0 ? "" : p.slice(0, i));
      const name = i < 0 ? p : p.slice(i + 1);
      if (!parent.children!.some((n) => n.type === "file" && n.name === name)) {
        parent.children!.push({ name, path: p, type: "file" });
      }
    }
  }

  const sort = (n: TreeNode) => {
    if (!n.children) return;
    n.children.sort((a, b) =>
      a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1
    );
    n.children.forEach(sort);
  };
  sort(root);
  return root;
}

/** every file path that ever appears in the history */
export function treeFiles(tree: TreeNode): Set<string> {
  const out = new Set<string>();
  const walk = (n: TreeNode) => {
    if (n.type === "file") out.add(n.path);
    n.children?.forEach(walk);
  };
  walk(tree);
  return out;
}

export interface ChildMetrics extends ObjectMetrics {
  name: string;
  path: string;
  type: "dir" | "file";
}

/** per-immediate-child metrics of a directory over the filtered commit set (single pass) */
export function childrenBreakdown(
  log: RepoLog,
  filters: Filters,
  dirPath: string,
  files: Set<string>
): ChildMetrics[] {
  const commits = filterCommits(log, filters);
  const map = new Map<string, { added: number; removed: number; modifications: number }>();
  for (const c of commits) {
    const agg = new Map<string, { a: number; r: number }>();
    for (const [p, d] of c.files) {
      if (!isUnder(p, dirPath)) continue;
      const rest = dirPath === "" ? p : p.slice(dirPath.length + 1);
      const i = rest.indexOf("/");
      const name = i === -1 ? rest : rest.slice(0, i);
      if (!name) continue;
      const e = agg.get(name) ?? { a: 0, r: 0 };
      e.a += d.added;
      e.r += d.removed;
      agg.set(name, e);
    }
    for (const [name, { a, r }] of agg) {
      const e = map.get(name) ?? { added: 0, removed: 0, modifications: 0 };
      if (a + r > 0) e.modifications++;
      e.added += a;
      e.removed += r;
      map.set(name, e);
    }
  }
  const n = commits.length;
  return [...map.entries()]
    .map(([name, e]) => {
      const p = dirPath === "" ? name : `${dirPath}/${name}`;
      const added = e.added;
      const removed = e.removed;
      const churn = added + removed;
      return {
        name,
        path: p,
        type: (files.has(p) ? "file" : "dir") as "dir" | "file",
        commitCount: n,
        added,
        removed,
        growth: added - removed,
        churn,
        modifications: e.modifications,
        modificationFrequency: n > 0 ? e.modifications / n : 0,
        churnRate: n > 0 ? churn / n : 0,
      };
    })
    .sort((a, b) => b.churn - a.churn);
}

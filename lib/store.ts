import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { randomBytes } from "node:crypto";
import readline from "node:readline";
import path from "node:path";
import { parseRepoLog, runGit, type RawCommit, type RepoLog } from "./engine/parse";
import { buildTree, type TreeNode } from "./engine/metrics";
import { cloneRepo, extractZip } from "./ingest";
import type { AuthorGroup } from "./authors";

const ROOT = process.cwd();
const DATA = path.join(ROOT, "data");
const REPOS_FILE = path.join(DATA, "repos.json");
const cachePath = (id: string) => path.join(DATA, "cache", `${id}.jsonl`);
const mergesPath = (id: string) => path.join(DATA, "merges", `${id}.json`);
const workdir = (id: string) => path.join(ROOT, "repos", id);

export type RepoStatus = "loading" | "ready" | "error";

export interface RepoEntry {
  id: string;
  name: string;
  source: { type: "zip" | "url"; url?: string };
  /** repo directory relative to project root (contains .git) */
  dir: string;
  status: RepoStatus;
  phase?: string;
  error?: string;
  head?: string;
  commitCount?: number;
  createdAt: number;
}

const memLogs = new Map<string, RepoLog>();
const memTrees = new Map<string, TreeNode>();

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

let reposChain: Promise<unknown> = Promise.resolve();

async function readRepos(): Promise<RepoEntry[]> {
  try {
    return JSON.parse(await readFile(REPOS_FILE, "utf8")) as RepoEntry[];
  } catch {
    return [];
  }
}

/** serialize read-modify-write cycles on repos.json */
function mutateRepos<T>(fn: (repos: RepoEntry[]) => T | Promise<T>): Promise<T> {
  const run = reposChain.then(async () => {
    const repos = await readRepos();
    const out = await fn(repos);
    await mkdir(DATA, { recursive: true });
    await writeFile(REPOS_FILE, JSON.stringify(repos, null, 2));
    return out;
  });
  reposChain = run.catch(() => {});
  return run;
}

export async function listRepos(): Promise<RepoEntry[]> {
  return (await readRepos()).sort((a, b) => b.createdAt - a.createdAt);
}

export async function getRepo(id: string): Promise<RepoEntry | undefined> {
  return (await readRepos()).find((r) => r.id === id);
}

async function updateEntry(id: string, patch: Partial<RepoEntry>): Promise<RepoEntry | undefined> {
  return mutateRepos((repos) => {
    const e = repos.find((r) => r.id === id);
    if (e) for (const [k, v] of Object.entries(patch)) (e as Record<string, unknown>)[k] = v;
    return e;
  });
}

function slug(name: string): string {
  const base =
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "repo";
  return `${base}-${randomBytes(3).toString("hex")}`;
}

export async function createFromUrl(url: string, name?: string): Promise<RepoEntry> {
  const pretty = name || url.split("/").filter(Boolean).pop()?.replace(/\.git$/, "") || "repo";
  const id = slug(pretty);
  const entry: RepoEntry = {
    id,
    name: pretty,
    source: { type: "url", url },
    dir: path.join("repos", id),
    status: "loading",
    phase: "cloning",
    createdAt: Date.now(),
  };
  await mutateRepos((repos) => repos.push(entry));
  void runIngest(id, "cloning", () => cloneRepo(url, path.join(ROOT, entry.dir)));
  return entry;
}

export async function createFromZip(buf: Buffer, name: string): Promise<RepoEntry> {
  const id = slug(name);
  const entry: RepoEntry = {
    id,
    name,
    source: { type: "zip" },
    dir: path.join("repos", id),
    status: "loading",
    phase: "extracting",
    createdAt: Date.now(),
  };
  await mutateRepos((repos) => repos.push(entry));
  void runIngest(id, "extracting", async () => {
    const gitDir = await extractZip(buf, workdir(id));
    await updateEntry(id, { dir: path.relative(ROOT, gitDir) });
  });
  return entry;
}

async function runIngest(id: string, phase: string, prepare: () => Promise<void>): Promise<void> {
  try {
    await updateEntry(id, { phase });
    await prepare();
    await updateEntry(id, { phase: "parsing" });
    const entry = await getRepo(id);
    if (!entry) return;
    const gitDir = path.join(ROOT, entry.dir);
    const log = await parseRepoLog(gitDir);
    const head = (await runGit(gitDir, ["rev-parse", "HEAD"])).trim();
    await saveLogCache(id, log);
    memLogs.set(id, log);
    memTrees.set(id, buildTree(log));
    await updateEntry(id, {
      status: "ready",
      phase: undefined,
      error: undefined,
      head,
      commitCount: log.commits.length,
    });
  } catch (e) {
    await updateEntry(id, { status: "error", phase: undefined, error: errMsg(e) });
  }
}

export async function deleteRepo(id: string): Promise<boolean> {
  const entry = await getRepo(id);
  if (!entry) return false;
  memLogs.delete(id);
  memTrees.delete(id);
  await mutateRepos((repos) => {
    const i = repos.findIndex((r) => r.id === id);
    if (i >= 0) repos.splice(i, 1);
  });
  await rm(workdir(id), { recursive: true, force: true });
  await rm(cachePath(id), { force: true });
  await rm(mergesPath(id), { force: true });
  return true;
}

/** read the repo's .mailmap at HEAD, if any */
export async function readMailmap(entry: RepoEntry): Promise<string | null> {
  try {
    return await runGit(path.join(ROOT, entry.dir), ["show", "HEAD:.mailmap"]);
  } catch {
    return null;
  }
}

export async function getGroups(id: string): Promise<AuthorGroup[]> {
  try {
    const data = JSON.parse(await readFile(mergesPath(id), "utf8")) as { groups: AuthorGroup[] };
    return data.groups;
  } catch {
    return [];
  }
}

export async function saveGroups(id: string, groups: AuthorGroup[]): Promise<void> {
  await mkdir(path.dirname(mergesPath(id)), { recursive: true });
  await writeFile(mergesPath(id), JSON.stringify({ groups }, null, 2));
}

export async function getLog(id: string): Promise<RepoLog> {
  const cached = memLogs.get(id);
  if (cached) return cached;
  const log = await loadLogCache(id);
  memLogs.set(id, log);
  return log;
}

export async function getTree(id: string): Promise<TreeNode> {
  const cached = memTrees.get(id);
  if (cached) return cached;
  const tree = buildTree(await getLog(id));
  memTrees.set(id, tree);
  return tree;
}

/**
 * JSONL cache: first line = metadata, then one line per commit:
 * [hash, parent, authorName, authorEmail, date, subject, [[path, added, removed], ...]]
 * Streamed both ways so large histories (100k commits) don't blow up memory.
 */
async function saveLogCache(id: string, log: RepoLog): Promise<void> {
  await mkdir(path.dirname(cachePath(id)), { recursive: true });
  const ws = createWriteStream(cachePath(id));
  const write = (s: string) =>
    new Promise<void>((resolve, reject) => {
      ws.write(s, (err) => (err ? reject(err) : resolve()));
    });
  await write(JSON.stringify({ version: 1, authors: log.authors }) + "\n");
  for (const c of log.commits) {
    const files = [...c.files].map(([p, d]) => [p, d.added, d.removed]);
    await write(JSON.stringify([c.hash, c.parent, c.authorName, c.authorEmail, c.date, c.subject, files]) + "\n");
  }
  await new Promise<void>((resolve, reject) => {
    ws.on("error", reject);
    ws.on("finish", resolve);
    ws.end();
  });
}

async function loadLogCache(id: string): Promise<RepoLog> {
  const rl = readline.createInterface({ input: createReadStream(cachePath(id)) });
  const commits: RawCommit[] = [];
  let authors: string[] = [];
  let first = true;
  for await (const line of rl) {
    if (first) {
      first = false;
      authors = (JSON.parse(line).authors ?? []) as string[];
      continue;
    }
    if (!line) continue;
    const a = JSON.parse(line) as [
      string,
      string | null,
      string,
      string,
      number,
      string,
      [string, number, number][],
    ];
    commits.push({
      hash: a[0],
      parent: a[1],
      authorName: a[2],
      authorEmail: a[3],
      date: a[4],
      subject: a[5],
      files: new Map(a[6].map(([p, added, removed]) => [p, { added, removed }])),
    });
  }
  return { commits, authors };
}

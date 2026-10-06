import { spawn } from "node:child_process";

/** Per-file line delta within a single commit (vs its parent). */
export interface FileDelta {
  added: number;
  removed: number;
}

export interface RawCommit {
  hash: string;
  /** h[p] — null for the initial commit (empty commit h∅) */
  parent: string | null;
  authorName: string;
  authorEmail: string;
  /** committer date, unix seconds */
  date: number;
  subject: string;
  /** files changed in this commit; binary files excluded */
  files: Map<string, FileDelta>;
}

export interface RepoLog {
  /** newest → oldest */
  commits: RawCommit[];
  /** unique raw "Name <email>" identities */
  authors: string[];
}

export const authorKey = (name: string, email: string) => `${name} <${email}>`;

/** "old => new" / "dir/{old => new}/file" → new path */
export function normalizePath(p: string): string {
  const brace = p.match(/^(.*)\{(.*?) => (.*?)\}(.*)$/);
  if (brace) return brace[1] + brace[3] + brace[4];
  const i = p.indexOf(" => ");
  return i >= 0 ? p.slice(i + 4) : p;
}

/** Run a git command, returns stdout. Rejects on non-zero exit. */
export function runGit(repoPath: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn("git", ["-C", repoPath, ...args]);
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d.toString("utf8")));
    p.stderr.on("data", (d) => (err += d.toString("utf8")));
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0 ? resolve(out) : reject(new Error(err.trim() || `git exited with code ${code}`))
    );
    p.stdin.end();
  });
}

const LOG_FORMAT = "%x00%H%x00%P%x00%an%x00%ae%x00%ct%x00%s";

/**
 * Single-pass extraction of the full non-merge history from HEAD using
 * `git log --no-merges -M50% --numstat`:
 * - rename detection at 50% => pure renames report 0/0 and rename+edit
 *   reports only the changed lines on the new path
 * - new files report all lines added, deleted files report all lines removed
 * - binary files report "-/-" and are skipped
 */
export function parseRepoLog(repoPath: string): Promise<RepoLog> {
  return new Promise((resolve, reject) => {
    const commits: RawCommit[] = [];
    const authors = new Set<string>();
    let cur: RawCommit | null = null;
    let rest = "";

    const proc = spawn("git", [
      "-C", repoPath,
      "-c", "core.quotePath=false",
      "log", "HEAD", "--no-merges", "-M50%", "--numstat",
      `--format=${LOG_FORMAT}`,
    ]);

    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString("utf8")));

    const handleLine = (line: string) => {
      if (!line) return;
      if (line.charCodeAt(0) === 0) {
        // commit header: ["", hash, parents, name, email, ct, subject]
        const f = line.split("\0");
        cur = {
          hash: f[1],
          parent: f[2] ? f[2].split(" ")[0] : null,
          authorName: f[3],
          authorEmail: f[4],
          date: Number.parseInt(f[5], 10),
          subject: f[6] ?? "",
          files: new Map(),
        };
        commits.push(cur);
        authors.add(authorKey(f[3], f[4]));
        return;
      }
      if (!cur) return;
      const parts = line.split("\t");
      if (parts.length < 3 || parts[0] === "-") return; // binary or malformed
      const path = normalizePath(parts.slice(2).join("\t"));
      const added = Number.parseInt(parts[0], 10);
      const removed = Number.parseInt(parts[1], 10);
      const prev = cur.files.get(path);
      if (prev) {
        prev.added += added;
        prev.removed += removed;
      } else {
        cur.files.set(path, { added, removed });
      }
    };

    proc.stdout.on("data", (d) => {
      const text = rest + d.toString("utf8");
      const lines = text.split("\n");
      rest = lines.pop() ?? "";
      for (const l of lines) handleLine(l);
    });

    proc.on("error", reject);
    proc.on("close", (code) => {
      if (rest) handleLine(rest);
      if (code !== 0) reject(new Error(`git log failed (${code}): ${stderr.slice(0, 300)}`));
      else resolve({ commits, authors: [...authors] });
    });

    proc.stdin.end();
  });
}

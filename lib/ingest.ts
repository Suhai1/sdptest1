import { spawn } from "node:child_process";
import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import AdmZip from "adm-zip";

/** Run a CLI command, returns stdout. Rejects on non-zero exit. */
export function runCli(cmd: string, args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d.toString("utf8")));
    p.stderr.on("data", (d) => (err += d.toString("utf8")));
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0 ? resolve(out) : reject(new Error(err.trim() || `${cmd} exited with code ${code}`))
    );
    p.stdin.end();
  });
}

/** Deep (bare) clone so we can run `git log` against the full history. */
export async function cloneRepo(url: string, dir: string): Promise<void> {
  await mkdir(path.dirname(dir), { recursive: true });
  await rm(dir, { recursive: true, force: true });
  await runCli("git", ["clone", "--bare", "--quiet", url, dir]);
}

/** Extract an uploaded zip and return the directory that contains the .git dir. */
export async function extractZip(buf: Buffer, dir: string): Promise<string> {
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const zip = new AdmZip(buf);
  zip.extractAllTo(dir, true);
  const root = await findGitRoot(dir);
  if (!root) throw new Error("no .git directory found inside the uploaded zip");
  return root;
}

async function findGitRoot(dir: string, depth = 0): Promise<string | null> {
  const entries = await readdir(dir, { withFileTypes: true });
  if (entries.some((e) => e.name === ".git")) return dir;
  if (depth >= 2) return null;
  for (const e of entries) {
    if (!e.isDirectory() || e.name === "__MACOSX") continue;
    const found = await findGitRoot(path.join(dir, e.name), depth + 1);
    if (found) return found;
  }
  return null;
}

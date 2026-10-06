import { parseRepoLog, runGit } from "../lib/engine/parse";
import {
  authorBreakdown,
  buildTree,
  computeMetrics,
  topFiles,
  type TreeNode,
} from "../lib/engine/metrics";

function countFiles(n: TreeNode): number {
  if (n.type === "file") return 1;
  return (n.children ?? []).reduce((s, c) => s + countFiles(c), 0);
}

async function main() {
  const repo = process.argv[2];
  if (!repo) {
    console.error("usage: npx tsx scripts/check.ts <repo-path>");
    process.exit(1);
  }

  const head = (await runGit(repo, ["rev-parse", "--short", "HEAD"])).trim();

  const t0 = Date.now();
  const log = await parseRepoLog(repo);
  const t1 = Date.now();

  console.log(`repo @ ${head}`);
  console.log(`parsed: ${log.commits.length} non-merge commits, ${log.authors.length} raw authors in ${t1 - t0} ms`);

  const tree = buildTree(log);
  const topLevel = (tree.children ?? [])
    .slice(0, 12)
    .map((c) => c.name + (c.type === "dir" ? "/" : ""))
    .join(", ");
  console.log(`tree: ${countFiles(tree)} files; top-level: ${topLevel}`);

  const repoAll = computeMetrics(log, {}, "", "dir");
  console.log("repo metrics (all commits):", repoAll);

  const top = topFiles(log, {}, 3);
  for (const f of top) {
    const m = computeMetrics(log, {}, f.path, "file");
    console.log(
      `hottest file: ${f.path} -> +${m.added} -${m.removed} growth=${m.growth} churn=${m.churn} mods=${m.modifications}`
    );
  }

  const dir = (tree.children ?? []).find((c) => c.type === "dir");
  if (dir) {
    const dm = computeMetrics(log, {}, dir.path, "dir");
    console.log(`sample dir: ${dir.path}/ -> +${dm.added} -${dm.removed} growth=${dm.growth} churn=${dm.churn} mods=${dm.modifications}`);
  }

  const authors = authorBreakdown(log, {}, "", "dir").slice(0, 5);
  console.log("top authors by churn (repo-wide):");
  for (const a of authors) {
    console.log(`  ${a.author}  churn=${a.churn} mods=${a.modifications} ownership=${(a.ownership * 100).toFixed(1)}%`);
  }

  const since = Math.floor(Date.UTC(2023, 0, 1) / 1000);
  const windowed = computeMetrics(log, { since }, "", "dir");
  console.log(`repo metrics (committer-date >= 2023-01-01): commits=${windowed.commitCount} +${windowed.added} -${windowed.removed} churn=${windowed.churn}`);

  // sanity check: engine's newest-commit totals vs raw `git show`
  const c0 = log.commits[0];
  if (c0) {
    let ea = 0;
    let er = 0;
    for (const d of c0.files.values()) {
      ea += d.added;
      er += d.removed;
    }
    const raw = await runGit(repo, [
      "-c", "core.quotePath=false",
      "show", c0.hash, "--numstat", "-M50%", "--format=",
    ]);
    let ga = 0;
    let gr = 0;
    for (const line of raw.split("\n")) {
      const parts = line.split("\t");
      if (parts.length < 3 || parts[0] === "-") continue;
      ga += Number.parseInt(parts[0], 10);
      gr += Number.parseInt(parts[1], 10);
    }
    const ok = ea === ga && er === gr;
    console.log(
      `sanity ${c0.hash.slice(0, 8)}: engine +${ea}/-${er} vs git-show +${ga}/-${gr} -> ${ok ? "MATCH" : "MISMATCH"}`
    );
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

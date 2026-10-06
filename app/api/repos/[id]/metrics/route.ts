import { NextResponse, type NextRequest } from "next/server";
import {
  authorBreakdown,
  childrenBreakdown,
  computeMetrics,
  treeFiles,
  type Filters,
} from "@/lib/engine/metrics";
import { resolveAuthorFilter, summarizeAuthors } from "@/lib/authors";
import { getGroups, getLog, getRepo, getTree } from "@/lib/store";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const entry = await getRepo(id);
  if (!entry) return NextResponse.json({ error: "repo not found" }, { status: 404 });
  if (entry.status !== "ready") {
    return NextResponse.json(
      { error: `repo is ${entry.status}`, phase: entry.phase, detail: entry.error },
      { status: 409 }
    );
  }

  try {
    const log = await getLog(id);
    const tree = await getTree(id);
    const files = treeFiles(tree);
    const groups = await getGroups(id);
    const sp = req.nextUrl.searchParams;

    const target = sp.get("path") ?? "";
    const kind: "file" | "dir" = target === "" || !files.has(target) ? "dir" : "file";

    const filters: Filters = {};
    const since = Number(sp.get("since"));
    if (Number.isFinite(since) && since > 0) filters.since = since;
    const until = Number(sp.get("until"));
    if (Number.isFinite(until) && until > 0) filters.until = until;
    const commits = sp.get("commits");
    if (commits) filters.commitHashes = new Set(commits.split(",").filter(Boolean));
    const author = sp.get("author");
    if (author) {
      const keys = resolveAuthorFilter(author, log.authors, groups);
      if (!keys) return NextResponse.json({ error: `unknown author: ${author}` }, { status: 400 });
      filters.authorKeys = keys;
    }

    const metrics = computeMetrics(log, filters, target, kind);
    const authors = summarizeAuthors(authorBreakdown(log, filters, target, kind), log.authors, groups);
    const children = kind === "dir" ? childrenBreakdown(log, filters, target, files) : undefined;

    return NextResponse.json({ path: target, kind, metrics, authors, children });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "metric computation failed" },
      { status: 500 }
    );
  }
}

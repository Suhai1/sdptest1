import { NextResponse, type NextRequest } from "next/server";
import { authorKey } from "@/lib/engine/parse";
import { resolveAuthorFilter, resolveAuthorGroups } from "@/lib/authors";
import { getGroups, getLog, getRepo } from "@/lib/store";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const entry = await getRepo(id);
  if (!entry) return NextResponse.json({ error: "repo not found" }, { status: 404 });
  if (entry.status !== "ready") {
    return NextResponse.json({ error: `repo is ${entry.status}`, phase: entry.phase }, { status: 409 });
  }

  const log = await getLog(id);
  const groups = await getGroups(id);
  const sp = req.nextUrl.searchParams;

  const offset = Math.max(0, Math.trunc(Number(sp.get("offset")) || 0));
  const limit = Math.min(500, Math.max(1, Math.trunc(Number(sp.get("limit")) || 50)));
  const q = (sp.get("q") ?? "").toLowerCase();
  const author = sp.get("author");

  let keys: Set<string> | null = null;
  if (author) {
    keys = resolveAuthorFilter(author, log.authors, groups);
    if (!keys) return NextResponse.json({ error: `unknown author: ${author}` }, { status: 400 });
  }

  const resolve = resolveAuthorGroups(log.authors, groups);
  const all = log.commits.filter((c) => {
    if (keys && !keys.has(authorKey(c.authorName, c.authorEmail))) return false;
    if (q && !c.subject.toLowerCase().includes(q)) return false;
    return true;
  });

  const commits = all.slice(offset, offset + limit).map((c) => {
    const raw = authorKey(c.authorName, c.authorEmail);
    return {
      hash: c.hash,
      date: c.date,
      author: resolve.get(raw)?.name ?? raw,
      rawAuthor: raw,
      subject: c.subject,
    };
  });

  return NextResponse.json({ total: all.length, offset, limit, commits });
}

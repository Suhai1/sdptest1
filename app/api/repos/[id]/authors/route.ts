import { NextResponse, type NextRequest } from "next/server";
import { authorKey } from "@/lib/engine/parse";
import { applyMailmap, parseMailmap } from "@/lib/authors";
import { getGroups, getLog, getRepo, readMailmap } from "@/lib/store";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const entry = await getRepo(id);
  if (!entry) return NextResponse.json({ error: "repo not found" }, { status: 404 });
  if (entry.status !== "ready") {
    return NextResponse.json({ error: `repo is ${entry.status}`, phase: entry.phase }, { status: 409 });
  }

  const log = await getLog(id);
  const groups = await getGroups(id);

  const counts = new Map<string, number>();
  for (const c of log.commits) {
    const k = authorKey(c.authorName, c.authorEmail);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const authors = [...counts.entries()]
    .map(([key, commits]) => {
      const m = key.match(/^(.*)<([^>]+)>$/);
      return { key, name: m ? m[1].trim() : key, email: m ? m[2].trim() : "", commits };
    })
    .sort((a, b) => b.commits - a.commits);

  const mailmap = await readMailmap(entry);
  const suggestions = mailmap ? applyMailmap(log.authors, parseMailmap(mailmap)) : [];

  return NextResponse.json({ authors, groups, mailmap, suggestions });
}

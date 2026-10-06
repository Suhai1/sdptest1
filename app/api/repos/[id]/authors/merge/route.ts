import { NextResponse, type NextRequest } from "next/server";
import { applyMailmap, parseMailmap, type AuthorGroup } from "@/lib/authors";
import { getLog, getRepo, readMailmap, saveGroups } from "@/lib/store";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const entry = await getRepo(id);
  if (!entry) return NextResponse.json({ error: "repo not found" }, { status: 404 });
  if (entry.status !== "ready") {
    return NextResponse.json({ error: `repo is ${entry.status}`, phase: entry.phase }, { status: 409 });
  }

  const log = await getLog(id);
  const body = (await req.json().catch(() => null)) as
    | { groups?: { name?: string; keys?: string[] }[]; applyMailmap?: boolean }
    | null;
  if (!body) return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });

  let groups: AuthorGroup[];

  if (body.applyMailmap) {
    const text = (await readMailmap(entry)) ?? "";
    const byMerged = new Map<string, AuthorGroup>();
    for (const s of applyMailmap(log.authors, parseMailmap(text))) {
      let g = byMerged.get(s.mergedKey);
      if (!g) {
        g = { id: `g${byMerged.size + 1}`, name: s.mergedName, keys: [] };
        byMerged.set(s.mergedKey, g);
      }
      g.keys.push(s.key);
    }
    groups = [...byMerged.values()];
  } else {
    if (!Array.isArray(body.groups)) {
      return NextResponse.json({ error: "expected { groups } or { applyMailmap: true }" }, { status: 400 });
    }
    const known = new Set(log.authors);
    const seen = new Set<string>();
    groups = [];
    for (const g of body.groups) {
      const keys = (Array.isArray(g?.keys) ? g.keys : []).map(String);
      if (keys.length === 0) continue;
      const unknown = keys.filter((k) => !known.has(k));
      if (unknown.length > 0) {
        return NextResponse.json({ error: `unknown author keys: ${unknown.join(", ")}` }, { status: 400 });
      }
      const dup = keys.find((k) => seen.has(k));
      if (dup) return NextResponse.json({ error: `author in multiple groups: ${dup}` }, { status: 400 });
      keys.forEach((k) => seen.add(k));
      groups.push({ id: `g${groups.length + 1}`, name: String(g.name || keys[0]), keys });
    }
  }

  await saveGroups(id, groups);
  return NextResponse.json({ groups });
}

import { NextResponse, type NextRequest } from "next/server";
import { getRepo, getTree } from "@/lib/store";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const entry = await getRepo(id);
  if (!entry) return NextResponse.json({ error: "repo not found" }, { status: 404 });
  if (entry.status !== "ready") {
    return NextResponse.json(
      { error: `repo is ${entry.status}`, phase: entry.phase, detail: entry.error },
      { status: 409 }
    );
  }
  return NextResponse.json({ tree: await getTree(id) });
}

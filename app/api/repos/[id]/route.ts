import { NextResponse, type NextRequest } from "next/server";
import { deleteRepo, getRepo } from "@/lib/store";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const entry = await getRepo(id);
  if (!entry) return NextResponse.json({ error: "repo not found" }, { status: 404 });
  return NextResponse.json({ repo: entry });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const ok = await deleteRepo(id);
  if (!ok) return NextResponse.json({ error: "repo not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

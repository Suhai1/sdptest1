import { NextResponse, type NextRequest } from "next/server";
import { createFromUrl, createFromZip, listRepos } from "@/lib/store";

export async function GET() {
  return NextResponse.json({ repos: await listRepos() });
}

/**
 * Node 18 has no global `File` (added in Node 20), so `file instanceof File`
 * throws there; duck-type the uploaded form entry instead.
 */
function isUploadedFile(v: FormDataEntryValue | null): v is File {
  return typeof v === "object" && v !== null && typeof (v as Blob).arrayBuffer === "function";
}

export async function POST(req: NextRequest) {
  try {
    const ct = req.headers.get("content-type") ?? "";
    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!isUploadedFile(file)) {
        return NextResponse.json(
          { error: "multipart field 'file' (zip of a repo with .git) is required" },
          { status: 400 }
        );
      }
      const name = String(form.get("name") || file.name.replace(/\.zip$/i, "") || "repo");
      const buf = Buffer.from(await file.arrayBuffer());
      const entry = await createFromZip(buf, name);
      return NextResponse.json({ id: entry.id, status: entry.status }, { status: 202 });
    }

    const body = (await req.json().catch(() => null)) as { url?: string; name?: string } | null;
    if (!body?.url || typeof body.url !== "string") {
      return NextResponse.json(
        { error: "provide either JSON { url } or multipart zip 'file'" },
        { status: 400 }
      );
    }
    const entry = await createFromUrl(body.url, body.name);
    return NextResponse.json({ id: entry.id, status: entry.status }, { status: 202 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "ingestion failed" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { get, put } from "@vercel/blob";

function pathnameFor(id: string) {
  return `diagrams/${id}.json`;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const result = await get(pathnameFor(id), { access: "private" });
    if (!result || !result.stream) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return new NextResponse(result.stream, {
      headers: { "content-type": "application/json" },
    });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.text();
  await put(pathnameFor(id), body, {
    access: "private",
    contentType: "application/json",
    allowOverwrite: true,
  });
  return NextResponse.json({ ok: true });
}

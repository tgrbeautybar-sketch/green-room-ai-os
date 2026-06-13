import { NextRequest, NextResponse } from "next/server";
import { saveImage } from "@/lib/storage";

export const runtime = "nodejs";

// Stores an uploaded image and returns a PUBLIC url for it (Supabase Storage when
// configured, local fallback otherwise). Instagram requires a public https URL.
const MAX_BYTES = 8 * 1024 * 1024;

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { dataUrl?: string };
  const match = (body.dataUrl ?? "").match(/^data:(image\/[a-z+]+);base64,(.+)$/i);
  if (!match) {
    return NextResponse.json({ error: "expected a base64 image data URL" }, { status: 400 });
  }

  const ext = EXT[match[1].toLowerCase()] ?? "jpg";
  const buf = Buffer.from(match[2], "base64");
  if (buf.length > MAX_BYTES) {
    return NextResponse.json({ error: "image too large (max 8MB)" }, { status: 400 });
  }

  try {
    const url = await saveImage(buf, ext, req.nextUrl.origin);
    return NextResponse.json({ url });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}

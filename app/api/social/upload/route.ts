import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";

// Stores an uploaded image and returns a PUBLIC url for it. Instagram (via Zernio)
// requires images to be fetchable at a public https URL — in-browser data URLs won't do.
const DIR = path.join(process.cwd(), ".data", "uploads");
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

  const mime = match[1].toLowerCase();
  const ext = EXT[mime] ?? "jpg";
  const buf = Buffer.from(match[2], "base64");
  if (buf.length > MAX_BYTES) {
    return NextResponse.json({ error: "image too large (max 8MB)" }, { status: 400 });
  }

  const fileName = `img_${Date.now()}_${Math.floor(Math.random() * 1e6)}.${ext}`;
  await fs.mkdir(DIR, { recursive: true });
  await fs.writeFile(path.join(DIR, fileName), buf);

  // Public origin (the deployed URL when live; localhost in dev — IG can't fetch localhost).
  const url = `${req.nextUrl.origin}/api/media/${fileName}`;
  return NextResponse.json({ url, fileName });
}

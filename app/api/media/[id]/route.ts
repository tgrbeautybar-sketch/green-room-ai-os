import { NextRequest } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";

// Public image server (exempt from auth in proxy.ts) so Zernio/Instagram can fetch
// the image when publishing. Serves files written by /api/social/upload.
const DIR = path.join(process.cwd(), ".data", "uploads");

const TYPE: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  // Block path traversal — only allow plain file names.
  if (!/^[A-Za-z0-9_.-]+$/.test(id) || id.includes("..")) {
    return new Response("bad request", { status: 400 });
  }

  try {
    const buf = await fs.readFile(path.join(DIR, id));
    const ext = id.split(".").pop()?.toLowerCase() ?? "";
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": TYPE[ext] ?? "application/octet-stream",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new Response("not found", { status: 404 });
  }
}

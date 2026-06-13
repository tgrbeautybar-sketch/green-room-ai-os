import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { supabase, SUPABASE_BUCKET } from "./supabase";

// Image hosting.
// - Supabase Storage when configured → returns a public URL (works on Vercel; what Instagram needs).
// - Local .data/uploads + /api/media fallback for dev.

const DIR = path.join(process.cwd(), ".data", "uploads");

const CONTENT_TYPE: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

/** Save an image and return a PUBLIC url. `localOrigin` is used only for the FS fallback. */
export async function saveImage(buf: Buffer, ext: string, localOrigin: string): Promise<string> {
  const safeExt = CONTENT_TYPE[ext] ? ext : "jpg";
  const fileName = `img_${Date.now()}_${Math.floor(Math.random() * 1e6)}.${safeExt}`;

  const sb = supabase();
  if (sb) {
    const { error } = await sb.storage
      .from(SUPABASE_BUCKET)
      .upload(fileName, buf, { contentType: CONTENT_TYPE[safeExt], upsert: false });
    if (error) throw new Error(`saveImage: ${error.message}`);
    const { data } = sb.storage.from(SUPABASE_BUCKET).getPublicUrl(fileName);
    return data.publicUrl;
  }

  // Local fallback — served by /api/media/[id]
  await fs.mkdir(DIR, { recursive: true });
  await fs.writeFile(path.join(DIR, fileName), buf);
  return `${localOrigin}/api/media/${fileName}`;
}

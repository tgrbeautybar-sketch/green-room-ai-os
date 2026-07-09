import { NextRequest, NextResponse } from "next/server";
import { listPosts, deletePost, publishEnabled } from "@/lib/social-publish";

export const runtime = "nodejs";

// Status view for Post Studio's history panel. Never 500s — the panel always
// gets a 200 with either posts, an empty list, or an error string to show Belinda.
export async function GET() {
  if (!publishEnabled) {
    return NextResponse.json({ enabled: false, posts: [] });
  }
  try {
    const posts = await listPosts(25);
    return NextResponse.json({ enabled: true, posts });
  } catch (err) {
    return NextResponse.json(
      { enabled: true, error: err instanceof Error ? err.message : String(err), posts: [] },
      { status: 200 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  if (!publishEnabled) {
    return NextResponse.json({ error: "not configured" }, { status: 400 });
  }
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  try {
    await deletePost(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}

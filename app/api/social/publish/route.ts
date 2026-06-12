import { NextRequest, NextResponse } from "next/server";
import { publishPost } from "@/lib/social-publish";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    content?: string;
    hashtags?: string[];
    igOn?: boolean;
    fbOn?: boolean;
    scheduledFor?: string;
    mediaUrls?: string[];
  };

  const caption = [body.content ?? "", (body.hashtags ?? []).join(" ")]
    .filter(s => s.trim().length > 0)
    .join("\n\n")
    .trim();

  if (!caption) return NextResponse.json({ error: "empty caption" }, { status: 400 });
  if (!body.igOn && !body.fbOn) return NextResponse.json({ error: "pick a channel" }, { status: 400 });

  try {
    const result = await publishPost({
      content: caption,
      igOn: !!body.igOn,
      fbOn: !!body.fbOn,
      scheduledFor: body.scheduledFor,
      // Instagram requires public media URLs — only forward real http(s) URLs (data: URLs won't work live).
      mediaUrls: (body.mediaUrls ?? []).filter(u => /^https?:\/\//.test(u)),
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}

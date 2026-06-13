import { NextRequest, NextResponse } from "next/server";
import { draftCaption, PostType } from "@/lib/demo/captions";
import { generateCaption, aiEnabled } from "@/lib/ai";
import { getState } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { type, seed } = (await req.json()) as {
    type: PostType;
    seed?: number;
  };

  const variation = Math.abs(seed ?? Date.now()) % 1000;
  const brand = await getState<{ text?: string }>("brand-voice");

  if (aiEnabled) {
    try {
      const live = await generateCaption({ type, variation, brandNotes: brand?.text });
      if (live) return NextResponse.json(live);
    } catch (err) {
      console.error("[social/draft] live caption failed, falling back:", err);
    }
  }

  const draft = draftCaption(type, undefined, variation);
  return NextResponse.json({ ...draft, mode: "demo" });
}

import { NextRequest, NextResponse } from "next/server";
import { draftCaption, PostType } from "@/lib/demo/captions";
import { findStylist } from "@/lib/demo/stylists";
import { generateCaption, aiEnabled } from "@/lib/ai";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { type, stylistId, seed } = (await req.json()) as {
    type: PostType;
    stylistId?: string;
    seed?: number;
  };

  const stylist = stylistId ? findStylist(stylistId) : undefined;
  const variation = Math.abs(seed ?? Date.now()) % 1000;

  if (aiEnabled) {
    try {
      const live = await generateCaption({
        type,
        stylistName: stylist?.name,
        stylistRole: stylist?.role,
        stylistHandle: stylist?.handle,
        stylistChair: stylist?.chair,
        variation,
      });
      if (live) return NextResponse.json(live);
    } catch (err) {
      console.error("[social/draft] live caption failed, falling back:", err);
    }
  }

  const draft = draftCaption(type, stylist, variation);
  return NextResponse.json({ ...draft, mode: "demo" });
}

import { NextRequest, NextResponse } from "next/server";
import { draftCaption, PostType } from "@/lib/demo/captions";
import { findStylist } from "@/lib/demo/stylists";

export async function POST(req: NextRequest) {
  const { type, stylistId, seed } = (await req.json()) as { type: PostType; stylistId?: string; seed?: number };
  const stylist = stylistId ? findStylist(stylistId) : undefined;
  const draft = draftCaption(type, stylist, seed ?? Date.now());
  return NextResponse.json({ ...draft, mode: "demo" });
}

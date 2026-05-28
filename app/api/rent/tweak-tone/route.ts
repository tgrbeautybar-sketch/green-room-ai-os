import { NextRequest, NextResponse } from "next/server";
import { rentRoll, draftReminderText } from "@/lib/demo/payments";
import { rewriteReminder, aiEnabled, ReminderTone } from "@/lib/ai";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { stylistId, tone } = (await req.json()) as {
    stylistId: string;
    tone: ReminderTone;
  };

  const row = rentRoll.find(r => r.stylistId === stylistId);
  if (!row) {
    return NextResponse.json({ error: "stylist not found" }, { status: 404 });
  }

  const original = draftReminderText(row);

  if (aiEnabled) {
    try {
      const live = await rewriteReminder({
        original,
        recipientFirstName: row.name.split(" ")[0],
        amount: row.amountDue - row.amountPaid,
        chair: row.chair,
        tone,
      });
      if (live) return NextResponse.json(live);
    } catch (err) {
      console.error("[rent/tweak-tone] live rewrite failed, falling back:", err);
    }
  }

  // Demo fallback — append a tone marker so the user sees something changed.
  const toneTag =
    tone === "warmer" ? " (and totally no rush!)" :
    tone === "firmer" ? " Need this today please." :
    " 🌿";
  return NextResponse.json({ text: original + toneTag, mode: "demo" });
}

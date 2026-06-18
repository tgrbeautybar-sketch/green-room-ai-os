import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";

export const runtime = "nodejs";

// Sends a rent reminder email to a renter. Auth-protected by proxy.ts.
// Note: delivering to arbitrary recipients (the stylists) requires a verified
// domain in Resend; otherwise Resend only allows the account owner's address.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    to?: string;
    name?: string;
    type?: string;
    amount?: number;
  };

  if (!body.to) {
    return NextResponse.json({ error: "recipient email required" }, { status: 400 });
  }

  const first = (body.name ?? "").split(" ")[0] || "there";
  const amount = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(body.amount ?? 0);
  const text = `Hi ${first}! Friendly reminder that your ${body.type ?? "space"} rent of ${amount} is due. Thank you so much! — Belinda`;

  try {
    const result = await sendEmail({ to: body.to, subject: "Rent reminder — The Green Room", text });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}

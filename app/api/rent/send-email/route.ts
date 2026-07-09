import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";
import { reminderText } from "@/lib/rent-email";

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

  const text = reminderText({ name: body.name ?? "", type: body.type ?? "space", amount: body.amount ?? 0 }, "friday");

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

import { NextResponse } from "next/server";
import { scanVenmoPayments, venmoScanEnabled, VenmoPayment } from "@/lib/venmo";
import { getState } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 30; // IMAP fetch can take a few seconds

type RentEntry = { id: string; name: string; type: string; amount: number; status: "paid" | "unpaid" };

export async function GET() {
  if (!venmoScanEnabled) {
    return NextResponse.json({ enabled: false, payments: [], matches: [] });
  }

  const roster = await getState<{ entries: RentEntry[] }>("rent-roster");
  const entries = roster?.entries ?? [];

  let payments: VenmoPayment[] = [];
  try {
    payments = await scanVenmoPayments(45);
  } catch (err) {
    return NextResponse.json(
      { enabled: true, error: err instanceof Error ? err.message : String(err), payments: [], matches: [] },
      { status: 502 }
    );
  }

  // Match each payment to a renter by amount + name overlap.
  const matches = payments.map(p => {
    const payer = p.payer.toLowerCase();
    const payerFirst = payer.split(/\s+/)[0];
    const candidate = entries.find(e => {
      const name = e.name.toLowerCase();
      const nameOverlap = payer.includes(name) || name.includes(payerFirst);
      return e.amount === p.amount && nameOverlap;
    });
    return {
      payment: p,
      matchId: candidate?.id ?? null,
      matchName: candidate?.name ?? null,
      alreadyPaid: candidate?.status === "paid",
    };
  });

  return NextResponse.json({ enabled: true, payments, matches });
}

import "server-only";
import { ImapFlow } from "imapflow";

// Reads Belinda's Gmail for Venmo "you got paid" notifications and extracts the
// payer + amount. Venmo has no payments API, so this parses the notification emails.
// Uses the same Gmail App Password as sending (IMAP read).

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, "");

export const venmoScanEnabled = !!GMAIL_USER && !!GMAIL_APP_PASSWORD;

export type VenmoPayment = { payer: string; amount: number; date: string; subject: string };

// Real Venmo subject formats (verified against the live inbox):
//   "Carolyn Keizl paid you $200.00"
//   "Kharys Gomez paid $300.00 to your Venmo account. ..."
// Ignore: "Your Venmo Standard transfer has been initiated" (outbound to bank), "You paid ..." (Belinda paying out)
export function parseVenmoSubject(subject: string): { payer: string; amount: number } | null {
  if (/^you paid/i.test(subject)) return null;
  let m = subject.match(/^(.+?)\s+paid you\s+\$([\d,]+(?:\.\d{2})?)/i);
  if (!m) m = subject.match(/^(.+?)\s+paid\s+\$([\d,]+(?:\.\d{2})?)\s+to your venmo account/i);
  if (!m) return null;
  return { payer: m[1].trim(), amount: parseFloat(m[2].replace(/,/g, "")) };
}

export async function scanVenmoPayments(days = 45): Promise<VenmoPayment[]> {
  if (!venmoScanEnabled) return [];

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: GMAIL_USER!, pass: GMAIL_APP_PASSWORD! },
    logger: false,
  });

  const payments: VenmoPayment[] = [];
  await client.connect();
  try {
    // Venmo notifications skip the inbox here, so scan All Mail.
    const lock = await client.getMailboxLock("[Gmail]/All Mail");
    try {
      const since = new Date(Date.now() - days * 24 * 3600 * 1000);
      const found = await client.search({ from: "venmo@venmo.com", since }, { uid: true });
      const uids = (Array.isArray(found) ? found : []).slice(-40);
      for (const uid of uids) {
        const msg = await client.fetchOne(uid, { envelope: true }, { uid: true });
        if (!msg) continue;
        const subject = msg.envelope?.subject ?? "";
        const parsed = parseVenmoSubject(subject);
        if (parsed) {
          payments.push({
            payer: parsed.payer,
            amount: parsed.amount,
            date: msg.envelope?.date ? new Date(msg.envelope.date).toISOString() : "",
            subject,
          });
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
  return payments;
}

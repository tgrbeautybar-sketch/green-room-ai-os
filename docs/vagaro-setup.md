# Vagaro Setup — Salon Dashboard

The Salon Dashboard shows *your* numbers — sales, average ticket, top service,
repeat clients — pulled from Vagaro. There are two ways to get your numbers in:
**upload a CSV today** (takes about ten seconds), or **connect Vagaro directly**
once your API access is approved (automatic, no more uploading). Both fill in
the exact same dashboard.

## Option A — Upload a CSV (works right now, no waiting)

1. In Vagaro, go to **Reports**.
2. Export your sales report to **CSV** (Vagaro sometimes calls this "Sales
   Report" or "Transaction Report" — either works).
3. In the Salon Dashboard, click **Upload your Vagaro export** and pick the
   file you just downloaded.
4. The first time, we may ask you to confirm which column is the date and
   which is the sale amount — pick them once and every future upload skips
   that step.
5. Your numbers fill in immediately. Re-upload any time (weekly is a good
   habit) — uploading the same file twice never double-counts a sale.

## Option B — Connect Vagaro directly (automatic, no uploading)

This is the "set it and forget it" option — once it's on, your dashboard
updates itself and you never touch a CSV again. It requires a couple of
things on Vagaro's side first:

1. **Requirements:** a paid Vagaro plan, and Vagaro credit-card processing
   turned on for your business (Vagaro's API access isn't available on the
   free tier or with an outside processor).
2. **Request access:** in Vagaro, go to **Settings → Developers → APIs &
   Webhooks** and request API access. Vagaro typically takes **~5–7 business
   days** to activate it — this is on their end, not ours, so the sooner you
   request it the sooner this switches on.
3. **Create a Transaction webhook** pointing to:
   ```
   https://green-room-ai-os.vercel.app/api/hooks/vagaro-transaction?key=<your webhook secret>
   ```
   The `<your webhook secret>` is a value we set together in `VAGARO_WEBHOOK_SECRET`
   (see the env vars below) — it's how we confirm the webhook really came from
   Vagaro and not someone else.
4. Send us the **Client ID**, **Client Secret**, and **Merchant ID** Vagaro
   gives you when access activates. We'll set them as environment variables
   and the dashboard switches from "Imported" to "Vagaro connected"
   automatically — nothing else changes on your end.

**In the meantime:** keep using Option A (CSV upload). The two aren't
exclusive — you can upload CSVs today and switch to the live connection the
moment Vagaro approves access, with zero data loss or double-counting.

## Environment variables (once Vagaro approves access)

Set these in Vercel → Project → Settings → Environment Variables:

```
VAGARO_CLIENT_ID=...
VAGARO_CLIENT_SECRET=...
VAGARO_MERCHANT_ID=...
VAGARO_WEBHOOK_SECRET=...     # any long random string; also goes in the webhook URL's ?key=
VAGARO_API_BASE=...           # only if Vagaro's docs specify something other than the default
```

Until `VAGARO_CLIENT_ID` + `VAGARO_CLIENT_SECRET` are both set, the dashboard
stays in CSV mode — nothing breaks, nothing needs to change, it just keeps
working the way it does today.

## What's built vs. what's unverified

- **Built and tested:** the CSV import (`lib/csv-import.ts`), the sales ledger
  storage (`lib/transactions.ts`), and the Transaction webhook receiver
  (`app/api/hooks/vagaro-transaction/route.ts`) — the webhook is live and
  reachable today, it just has nothing to authenticate against yet.
- **Unverified (TO-VERIFY once credentials arrive):** the exact Vagaro API
  base URL, token endpoint, and transactions endpoint path in `lib/vagaro.ts`
  are named constants using Vagaro's publicly-described shape — we have no
  live account to test them against yet, so treat the first real connection
  attempt as a smoke test, not a guaranteed "just works."

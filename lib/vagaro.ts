import "server-only";
import type { NormalizedTxn } from "./transactions";

// Vagaro's token-auth REST API (see docs/go-live-requirements.md Module 2 and
// docs/vagaro-setup.md). Vagaro requires a paid plan + their own credit-card
// processing before API access activates (~5-7 business days) — as of this
// writing we have no live credentials and this has never been exercised
// against a real account. Every endpoint path/shape below is TO-VERIFY the
// moment credentials arrive; only VAGARO_CLIENT_ID/SECRET gate `vagaroEnabled`
// so the rest of the dashboard can safely check that flag today.

const CLIENT_ID = process.env.VAGARO_CLIENT_ID;
const CLIENT_SECRET = process.env.VAGARO_CLIENT_SECRET;
const MERCHANT_ID = process.env.VAGARO_MERCHANT_ID;

export const vagaroEnabled = !!CLIENT_ID && !!CLIENT_SECRET;

// TO-VERIFY: Vagaro doesn't publish a stable public base URL/paths as of this
// writing. These are named constants so the real values are a one-line swap
// once support confirms them — not a rewrite.
const API_BASE = process.env.VAGARO_API_BASE || "https://api.vagaro.com"; // TO-VERIFY
const TOKEN_PATH = "/oauth/token"; // TO-VERIFY
const TRANSACTIONS_PATH = "/v1/transactions"; // TO-VERIFY

type TokenCache = { accessToken: string; expiresAt: number };
let tokenCache: TokenCache | null = null;

export async function getAccessToken(): Promise<string> {
  if (!vagaroEnabled) throw new Error("Vagaro not configured");
  if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000) {
    return tokenCache.accessToken;
  }

  const res = await fetch(`${API_BASE}${TOKEN_PATH}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials", client_id: CLIENT_ID, client_secret: CLIENT_SECRET }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Vagaro token request failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in?: number };
  tokenCache = { accessToken: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return tokenCache.accessToken;
}

// Shape of Vagaro's Transaction webhook/API payload — field names per the
// architecture spec; TO-VERIFY against a real payload once creds land.
export type VagaroTransactionPayload = {
  transactionDate?: string;
  businessId?: string;
  transactionId?: string;
  userPaymentId?: string;
  itemSold?: string;
  purchaseType?: string;
  quantity?: number;
  ccAmount?: number;
  cashAmount?: number;
  customerId?: string;
  serviceProviderId?: string;
  appointmentId?: string;
  serviceCategory?: string;
};

export function normalizeVagaroTransaction(
  raw: VagaroTransactionPayload,
  source: "vagaro-webhook" | "vagaro-api"
): NormalizedTxn {
  const gross = (Number(raw.ccAmount) || 0) + (Number(raw.cashAmount) || 0);
  const date = (raw.transactionDate ?? "").slice(0, 10) || new Date().toISOString().slice(0, 10);
  return {
    id: `vagaro:${raw.transactionId ?? "unknown"}:${raw.userPaymentId ?? "unknown"}`,
    externalId: raw.transactionId ?? "",
    source,
    date,
    gross,
    tip: 0, // Vagaro's Transaction payload doesn't appear to carry tip separately — TO-VERIFY
    itemName: raw.itemSold ?? "",
    category: raw.serviceCategory ?? "",
    purchaseType: raw.purchaseType ?? "",
    customerId: raw.customerId ?? null,
    serviceProviderId: raw.serviceProviderId ?? null,
    appointmentId: raw.appointmentId ?? null,
    importedAt: new Date().toISOString(),
  };
}

// For backfill / a future daily reconcile — deliberately NOT wired to a cron
// yet. Caller (a future job) is responsible for calling upsertTransactions().
export async function fetchTransactions({ from, to }: { from: string; to: string }): Promise<NormalizedTxn[]> {
  if (!vagaroEnabled) return [];

  const token = await getAccessToken();
  const params = new URLSearchParams({ merchantId: MERCHANT_ID ?? "", from, to }); // TO-VERIFY query param names
  const res = await fetch(`${API_BASE}${TRANSACTIONS_PATH}?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Vagaro transactions fetch failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as { transactions?: VagaroTransactionPayload[] };
  const raw = Array.isArray(data.transactions) ? data.transactions : [];
  return raw.map(t => normalizeVagaroTransaction(t, "vagaro-api"));
}

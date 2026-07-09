import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { supabase } from "./supabase";

// Belinda's own sales ledger — one normalized shape for every source (Vagaro
// webhook, Vagaro API backfill, CSV import). Mirrors the persistence pattern
// in lib/store.ts: Supabase when configured, local `.data/` file for dev.
//
// Table (see docs/supabase-setup.md):
//   transactions(id text pk, external_id, source, date, gross, tip, item_name,
//                category, purchase_type, customer_id, service_provider_id,
//                appointment_id, imported_at)
//
// Unlike addMessage() in lib/store.ts, a Supabase failure here always throws —
// there is no tolerated "missing column" retry, because a missing `transactions`
// table (PGRST205) means the migration in docs/supabase-setup.md hasn't run yet,
// and silently falling back to the local file in prod would just lose the sale.

const DATA_DIR = path.join(process.cwd(), ".data");
const TXN_FILE = path.join(DATA_DIR, "transactions.json");

export type TxnSource = "vagaro-webhook" | "vagaro-api" | "csv";

export type NormalizedTxn = {
  id: string; // deterministic dedupe key — see lib/csv-import.ts / the webhook route
  externalId: string;
  source: TxnSource;
  date: string; // ISO yyyy-mm-dd
  gross: number; // refunds are negative
  tip: number; // 0 if unknown
  itemName: string;
  category: string;
  purchaseType: string;
  customerId: string | null;
  serviceProviderId: string | null;
  appointmentId: string | null;
  importedAt: string; // ISO timestamp
};

type TxnRow = {
  id: string;
  external_id: string;
  source: string;
  date: string;
  gross: number;
  tip: number;
  item_name: string;
  category: string;
  purchase_type: string;
  customer_id: string | null;
  service_provider_id: string | null;
  appointment_id: string | null;
  imported_at: string;
};

function toRow(t: NormalizedTxn): TxnRow {
  return {
    id: t.id,
    external_id: t.externalId,
    source: t.source,
    date: t.date,
    gross: t.gross,
    tip: t.tip,
    item_name: t.itemName,
    category: t.category,
    purchase_type: t.purchaseType,
    customer_id: t.customerId,
    service_provider_id: t.serviceProviderId,
    appointment_id: t.appointmentId,
    imported_at: t.importedAt,
  };
}

function fromRow(r: TxnRow): NormalizedTxn {
  return {
    id: r.id,
    externalId: r.external_id ?? "",
    source: (r.source as TxnSource) ?? "csv",
    date: r.date,
    gross: Number(r.gross) || 0,
    tip: Number(r.tip) || 0,
    itemName: r.item_name ?? "",
    category: r.category ?? "",
    purchaseType: r.purchase_type ?? "",
    customerId: r.customer_id ?? null,
    serviceProviderId: r.service_provider_id ?? null,
    appointmentId: r.appointment_id ?? null,
    importedAt: r.imported_at,
  };
}

const CHUNK_SIZE = 500;
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function isMissingTableError(message: string, code?: string): boolean {
  return code === "PGRST205" || /relation .*transactions.* does not exist|could not find the table/i.test(message);
}

// Upsert by id — ON CONFLICT DO UPDATE, via Supabase's .upsert(). Re-importing
// the same CSV or replaying a webhook is always safe: same id → same row, zero
// net new. Vagaro-sourced ids are authoritative (see lib/csv-import.ts / the
// webhook route for how ids are built).
export async function upsertTransactions(rows: NormalizedTxn[]): Promise<void> {
  if (rows.length === 0) return;

  const sb = supabase();
  if (sb) {
    for (const batch of chunk(rows, CHUNK_SIZE)) {
      const { error } = await sb.from("transactions").upsert(batch.map(toRow), { onConflict: "id" });
      if (error) {
        if (isMissingTableError(error.message, error.code)) {
          throw new Error(
            `upsertTransactions: the "transactions" table doesn't exist yet — run the migration in docs/supabase-setup.md (${error.message})`
          );
        }
        throw new Error(`upsertTransactions: ${error.message}`);
      }
    }
    return;
  }

  await fs.mkdir(DATA_DIR, { recursive: true });
  const all = await readLocalFile();
  const byId = new Map(all.map(t => [t.id, t]));
  for (const t of rows) byId.set(t.id, t);
  await fs.writeFile(TXN_FILE, JSON.stringify([...byId.values()], null, 2), "utf-8");
}

// Inclusive date range, both ISO yyyy-mm-dd.
export async function listTransactions(from: string, to: string): Promise<NormalizedTxn[]> {
  const sb = supabase();
  if (sb) {
    const { data, error } = await sb
      .from("transactions")
      .select("*")
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: true });
    if (error) {
      if (isMissingTableError(error.message, error.code)) {
        throw new Error(
          `listTransactions: the "transactions" table doesn't exist yet — run the migration in docs/supabase-setup.md (${error.message})`
        );
      }
      throw new Error(`listTransactions: ${error.message}`);
    }
    return (data ?? []).map(fromRow);
  }

  const all = await readLocalFile();
  return all.filter(t => t.date >= from && t.date <= to).sort((a, b) => a.date.localeCompare(b.date));
}

// Deletes rows scoped to `source` when given, else clears the whole ledger
// (used to let Belinda re-import a clean CSV export).
export async function clearTransactions(source?: TxnSource): Promise<void> {
  const sb = supabase();
  if (sb) {
    let q = sb.from("transactions").delete();
    q = source ? q.eq("source", source) : q.neq("id", "");
    const { error } = await q;
    if (error) {
      if (isMissingTableError(error.message, error.code)) return; // nothing to clear
      throw new Error(`clearTransactions: ${error.message}`);
    }
    return;
  }

  const all = await readLocalFile();
  const kept = source ? all.filter(t => t.source !== source) : [];
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(TXN_FILE, JSON.stringify(kept, null, 2), "utf-8");
}

async function readLocalFile(): Promise<NormalizedTxn[]> {
  try {
    return JSON.parse(await fs.readFile(TXN_FILE, "utf-8")) as NormalizedTxn[];
  } catch {
    return [];
  }
}

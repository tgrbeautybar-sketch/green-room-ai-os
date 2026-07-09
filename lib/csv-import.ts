import "server-only";
import Papa from "papaparse";
import { createHash } from "crypto";
import type { NormalizedTxn } from "./transactions";

// Turns whatever Belinda exports from Vagaro Reports into NormalizedTxn rows.
// Vagaro's export column names aren't guaranteed (and may change), so headers
// are matched fuzzily (case/punctuation-insensitive) against a candidate list
// per field. Only date + gross are required — everything else degrades gracefully.

export type CsvField = "date" | "gross" | "tip" | "item" | "customer" | "transactionId";
export type CsvMapping = Partial<Record<CsvField, string>>; // field -> actual CSV header

export type CsvParseResult =
  | { needsMapping: true; headers: string[]; sampleRow: Record<string, string> }
  | { needsMapping: false; rows: NormalizedTxn[]; skipped: number };

const HEADER_CANDIDATES: Record<CsvField, string[]> = {
  date: ["date", "transaction date", "sale date"],
  gross: ["total", "amount", "net sales", "sales", "price", "grand total"],
  tip: ["tip", "gratuity"],
  item: ["item", "service", "description", "item sold", "product"],
  customer: ["client", "customer", "client name"],
  transactionId: ["transaction id", "receipt", "invoice", "sale id"],
};

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function resolveMapping(headers: string[], confirmed?: CsvMapping): CsvMapping {
  const byNormalized = new Map(headers.map(h => [normalizeHeader(h), h]));
  const mapping: CsvMapping = {};

  for (const field of Object.keys(HEADER_CANDIDATES) as CsvField[]) {
    // A previously-confirmed column wins, as long as this file still has it
    // (lets repeat imports of the same export format skip the mapping step).
    const confirmedHeader = confirmed?.[field];
    if (confirmedHeader && headers.includes(confirmedHeader)) {
      mapping[field] = confirmedHeader;
      continue;
    }
    for (const candidate of HEADER_CANDIDATES[field]) {
      const actual = byNormalized.get(candidate);
      if (actual) {
        mapping[field] = actual;
        break;
      }
    }
  }
  return mapping;
}

// Handles "$1,234.56", "1234.56", "(1,234.56)" (accounting negative), and a
// leading "-". Returns null (unparseable) for anything else — callers skip
// that row rather than fabricate a number.
export function parseMoney(raw: unknown): number | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;

  let negative = false;
  if (s.startsWith("(") && s.endsWith(")")) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[$,\s]/g, "");
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;

  const n = parseFloat(s);
  if (Number.isNaN(n)) return null;
  return negative ? -n : n;
}

// Tolerant date parser → ISO yyyy-mm-dd, or null if the value isn't a real
// date. This is what actually filters out total/summary rows that Vagaro
// exports sometimes append (they have a $ total but no transaction date).
export function parseDateToISO(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // Already ISO (optionally with a time component) — 2026-07-09 or 2026-07-09T00:00:00
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  // US m/d/yyyy or m/d/yy, optionally followed by a time — the common Vagaro export format.
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    const [, moRaw, daRaw, yrRaw] = m;
    const mm = moRaw.padStart(2, "0");
    const dd = daRaw.padStart(2, "0");
    const yr = yrRaw.length === 2 ? (Number(yrRaw) < 70 ? `20${yrRaw}` : `19${yrRaw}`) : yrRaw;
    if (Number(mm) < 1 || Number(mm) > 12 || Number(dd) < 1 || Number(dd) > 31) return null;
    return `${yr}-${mm}-${dd}`;
  }

  // Fallback for things like "Jul 9, 2026" — read the parsed LOCAL calendar
  // fields (not toISOString(), which can shift the date across a timezone
  // boundary for date-only strings) so we don't silently mis-date a row.
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const yr = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yr}-${mm}-${dd}`;
}

function sha1(input: string): string {
  return createHash("sha1").update(input).digest("hex");
}

export function parseCsv(csvText: string, confirmedMapping?: CsvMapping): CsvParseResult {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: h => h.trim(),
  });

  const headers = parsed.meta.fields ?? [];
  const dataRows = parsed.data ?? [];
  const mapping = resolveMapping(headers, confirmedMapping);

  if (!mapping.date || !mapping.gross) {
    return { needsMapping: true, headers, sampleRow: dataRows[0] ?? {} };
  }

  const dateHeader = mapping.date;
  const grossHeader = mapping.gross;
  const importedAt = new Date().toISOString();
  const rows: NormalizedTxn[] = [];
  let skipped = 0;

  for (const row of dataRows) {
    const date = parseDateToISO(row[dateHeader]);
    const gross = parseMoney(row[grossHeader]);
    if (date === null || gross === null) {
      skipped++;
      continue;
    }

    const tip = mapping.tip ? parseMoney(row[mapping.tip]) ?? 0 : 0;
    const itemName = mapping.item ? (row[mapping.item] ?? "").trim() : "";
    const customerRaw = mapping.customer ? (row[mapping.customer] ?? "").trim() : "";
    const customerId = customerRaw || null;
    const externalId = mapping.transactionId ? (row[mapping.transactionId] ?? "").trim() : "";

    // Vagaro-provided transaction ids are authoritative dedupe keys; without
    // one, hash the row's identifying fields so re-importing the same export
    // produces the same ids (net zero new rows) instead of duplicating everything.
    const id = externalId ? `csv:${externalId}` : `csv:${sha1(`${date}|${gross}|${itemName}|${customerRaw}`)}`;

    rows.push({
      id,
      externalId,
      source: "csv",
      date,
      gross,
      tip,
      itemName,
      category: "",
      purchaseType: "",
      customerId,
      serviceProviderId: null,
      appointmentId: null,
      importedAt,
    });
  }

  return { needsMapping: false, rows, skipped };
}

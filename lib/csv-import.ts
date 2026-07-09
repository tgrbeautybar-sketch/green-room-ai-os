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
  | { needsMapping: true; unreadable: false; headers: string[]; sampleRow: Record<string, string> }
  // Genuine garbage (images, PDFs, prose, JSON) rather than a CSV with
  // unexpected headers — routing this into the mapping step would show
  // Belinda a "pick a column" UI full of gibberish selects instead of a
  // clear "wrong file" error (DV-001).
  | { needsMapping: false; unreadable: true }
  | { needsMapping: false; unreadable: false; rows: NormalizedTxn[]; skipped: number };

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

// A stray control character (other than tab/newline/CR, which real CSVs can
// legitimately carry inside quoted fields) or the Unicode replacement
// character means this text isn't a decoded CSV at all — it's binary that
// happened to decode into something header-shaped, e.g. a PNG's magic bytes
// reading back as a garbled "PNG" header (DV-001). Checked by char code
// rather than a regex literal so no literal control bytes have to live in
// source.
const REPLACEMENT_CHAR_CODE = 0xfffd;

function hasBinarySignature(field: string): boolean {
  for (let i = 0; i < field.length; i++) {
    const code = field.charCodeAt(i);
    const isStrayControlChar = code <= 0x1f && code !== 0x09 && code !== 0x0a && code !== 0x0d;
    if (isStrayControlChar || code === REPLACEMENT_CHAR_CODE) return true;
  }
  return false;
}

// Distinguishes genuine garbage (images, PDFs, prose, JSON) from a real CSV
// that merely has headers we don't recognize (that one still needs the
// mapping step, not this error) — DV-001.
function looksUnreadable(headers: string[], sampleRow: Record<string, string>): boolean {
  if (headers.length < 2) return true;
  if (headers.some(hasBinarySignature)) return true;
  const values = Object.values(sampleRow);
  if (values.length === 0) return true;
  if (values.every(v => !v || !v.trim())) return true;
  return false;
}

export function parseCsv(csvText: string, confirmedMapping?: CsvMapping): CsvParseResult {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: h => h.trim(),
  });

  const headers = parsed.meta.fields ?? [];
  const dataRows = parsed.data ?? [];
  const sampleRow = dataRows[0] ?? {};

  if (looksUnreadable(headers, sampleRow)) {
    return { needsMapping: false, unreadable: true };
  }

  const mapping = resolveMapping(headers, confirmedMapping);

  if (!mapping.date || !mapping.gross) {
    return { needsMapping: true, unreadable: false, headers, sampleRow };
  }

  const dateHeader = mapping.date;
  const grossHeader = mapping.gross;
  const importedAt = new Date().toISOString();
  const rows: NormalizedTxn[] = [];
  let skipped = 0;
  // Per-file ordinal over KEPT rows only (skipped rows never reach here), so
  // re-importing the exact same export walks the same rows in the same order
  // and reproduces the same ordinals — same ids, net zero new rows. Without
  // this, two identical same-day walk-ins (same date/amount/item/no id)
  // hashed to one id and silently collapsed into a single row (F-3).
  let ordinal = 0;

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
    // one, hash the row's identifying fields plus its ordinal so re-importing
    // the same export produces the same ids (net zero new rows) instead of
    // duplicating everything, while distinct rows with identical-looking
    // fields (e.g. two $45 walk-in haircuts on the same day) still get
    // distinct ids.
    const id = externalId
      ? `csv:${externalId}`
      : `csv:${sha1(`${date}|${gross}|${itemName}|${customerRaw}`)}:${ordinal}`;
    ordinal++;

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

  return { needsMapping: false, unreadable: false, rows, skipped };
}

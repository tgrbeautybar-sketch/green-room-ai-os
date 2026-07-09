import { NextRequest, NextResponse } from "next/server";
import { parseCsv, type CsvMapping } from "@/lib/csv-import";
import { upsertTransactions, clearTransactions } from "@/lib/transactions";

export const runtime = "nodejs";
export const maxDuration = 30;

// Belinda's CSV import. Auth-protected by default (not listed in proxy.ts's
// public paths) — this is Belinda uploading a file from inside the app, not
// an external webhook.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    csvText?: string;
    fileName?: string;
    mapping?: CsvMapping;
  };

  const csvText = body.csvText ?? "";
  if (!csvText.trim()) {
    return NextResponse.json({ ok: false, error: "no file content" }, { status: 200 });
  }

  let parsed;
  try {
    parsed = parseCsv(csvText, body.mapping);
  } catch (err) {
    console.error("dashboard/import: parse failed", body.fileName, err);
    return NextResponse.json({ ok: false, error: "couldn't read that file" }, { status: 200 });
  }

  if (parsed.unreadable) {
    // Genuine garbage (image bytes, PDFs, prose, JSON) — not a CSV with
    // unexpected headers — so send Belinda the "wrong file" error instead of
    // the column-mapping step full of gibberish selects (DV-001).
    return NextResponse.json({ ok: false, error: "unreadable" }, { status: 200 });
  }

  if (parsed.needsMapping) {
    return NextResponse.json(
      { ok: false, needsMapping: true, headers: parsed.headers, sampleRow: parsed.sampleRow },
      { status: 200 }
    );
  }

  const { rows, skipped } = parsed;
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, imported: 0, skipped, dateRange: null });
  }

  const dates = rows.map(r => r.date);
  const from = dates.reduce((min, d) => (d < min ? d : min));
  const to = dates.reduce((max, d) => (d > max ? d : max));

  try {
    await upsertTransactions(rows);
  } catch (err) {
    console.error("dashboard/import: upsert failed", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "couldn't save your sales" },
      { status: 200 }
    );
  }

  return NextResponse.json({
    ok: true,
    imported: rows.length,
    skipped,
    dateRange: { from, to },
  });
}

export async function DELETE() {
  try {
    await clearTransactions("csv");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 200 }
    );
  }
}

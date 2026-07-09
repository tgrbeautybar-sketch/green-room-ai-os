import { describe, it, expect } from "vitest";
import { parseCsv, parseMoney, parseDateToISO } from "./csv-import";

describe("parseCsv row id ordinals (F-3)", () => {
  const HEADER = "Date,Total,Item,Client\n";

  it("gives identical same-day walk-ins distinct ids via a per-row ordinal", () => {
    const csv = HEADER + "07/09/2026,45.00,Haircut,\n07/09/2026,45.00,Haircut,\n";
    const result = parseCsv(csv);
    if (result.needsMapping || result.unreadable) throw new Error("expected a mapped result");

    expect(result.rows).toHaveLength(2);
    const [a, b] = result.rows;
    expect(a.id).not.toBe(b.id);
    expect(a.id).toMatch(/^csv:.+:0$/);
    expect(b.id).toMatch(/^csv:.+:1$/);
  });

  it("re-importing the exact same file produces the same ids (dedupe-safe)", () => {
    const csv =
      HEADER +
      "07/09/2026,45.00,Haircut,\n" +
      "07/09/2026,45.00,Haircut,\n" +
      "07/10/2026,20.00,Blowout,\n";

    const first = parseCsv(csv);
    const second = parseCsv(csv);
    if (first.needsMapping || first.unreadable || second.needsMapping || second.unreadable) {
      throw new Error("expected mapped results");
    }

    expect(second.rows.map(r => r.id)).toEqual(first.rows.map(r => r.id));
  });

  it("keeps ordinals stable across a re-import even when unparseable rows are skipped in between", () => {
    const csv =
      HEADER +
      "07/09/2026,45.00,Haircut,\n" + // ordinal 0
      "not a date,45.00,Haircut,\n" + // skipped — never consumes an ordinal
      "07/09/2026,45.00,Haircut,\n"; // ordinal 1

    const first = parseCsv(csv);
    const second = parseCsv(csv);
    if (first.needsMapping || first.unreadable || second.needsMapping || second.unreadable) {
      throw new Error("expected mapped results");
    }

    expect(first.skipped).toBe(1);
    expect(first.rows.map(r => r.id)).toEqual(second.rows.map(r => r.id));
    expect(first.rows[0].id).not.toBe(first.rows[1].id);
  });

  it("uses the external transaction id verbatim when present, ignoring ordinal", () => {
    const csvWithId = "Date,Total,Item,Client,Transaction Id\n07/09/2026,45.00,Haircut,,TX-1\n07/09/2026,45.00,Haircut,,TX-2\n";
    const result = parseCsv(csvWithId);
    if (result.needsMapping || result.unreadable) throw new Error("expected a mapped result");

    expect(result.rows[0].id).toBe("csv:TX-1");
    expect(result.rows[1].id).toBe("csv:TX-2");
  });
});

describe("parseCsv garbage detection (DV-001)", () => {
  it("flags a PNG's magic bytes as unreadable rather than routing to mapping", () => {
    // Mirrors what a PNG's signature bytes decode to as text: the replacement
    // character (invalid UTF-8 byte) followed by the SUB control byte (0x1A)
    // PNG embeds right after "PNG".
    const pngLike = `${String.fromCharCode(0xfffd)}PNG\r\n${String.fromCharCode(0x1a)}\n`;
    const result = parseCsv(pngLike);
    expect(result.needsMapping).toBe(false);
    expect(result.unreadable).toBe(true);
  });

  it("flags plain prose as unreadable", () => {
    const prose =
      "This report was generated automatically for internal review purposes only. " +
      "It does not contain any sales data and should be disregarded entirely.";
    const result = parseCsv(prose);
    expect(result.needsMapping).toBe(false);
    expect(result.unreadable).toBe(true);
  });

  it("flags a pretty-printed JSON blob as unreadable", () => {
    const json = '{\n  "name": "Jo"\n  "amount": 45\n}\n';
    const result = parseCsv(json);
    expect(result.needsMapping).toBe(false);
    expect(result.unreadable).toBe(true);
  });

  it("flags a replacement character in a header even with two+ columns (not just the headers.length<2 case)", () => {
    const csv = `${String.fromCharCode(0xfffd)}PNG,IHDR\nsomeval,otherval\n`;
    const result = parseCsv(csv);
    expect(result.needsMapping).toBe(false);
    expect(result.unreadable).toBe(true);
  });

  it("flags an empty file as unreadable rather than a mapped zero-row result", () => {
    const result = parseCsv("");
    expect(result.needsMapping).toBe(false);
    expect(result.unreadable).toBe(true);
  });

  it("still routes a real CSV with unrecognized headers to mapping, not the error path", () => {
    const wrongHeaders = "Name,Phone\nJo,555\n";
    const result = parseCsv(wrongHeaders);
    expect(result.unreadable).toBe(false);
    expect(result.needsMapping).toBe(true);
  });

  it("parses a valid Vagaro-ish CSV into rows", () => {
    const csv = "Date,Total,Item,Client\n07/09/2026,45.00,Haircut,Jo\n";
    const result = parseCsv(csv);
    expect(result.unreadable).toBe(false);
    expect(result.needsMapping).toBe(false);
    if (result.needsMapping || result.unreadable) throw new Error("expected a mapped result");
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].gross).toBe(45);
  });
});

describe("parseMoney", () => {
  it("parses plain, currency-formatted, and accounting-negative amounts", () => {
    expect(parseMoney("45")).toBe(45);
    expect(parseMoney("$1,234.56")).toBe(1234.56);
    expect(parseMoney("(1,234.56)")).toBe(-1234.56);
    expect(parseMoney("-45.00")).toBe(-45);
  });

  it("returns null for unparseable input", () => {
    expect(parseMoney("")).toBeNull();
    expect(parseMoney(undefined)).toBeNull();
    expect(parseMoney("total")).toBeNull();
  });
});

describe("parseDateToISO", () => {
  it("parses ISO and US-format dates", () => {
    expect(parseDateToISO("2026-07-09")).toBe("2026-07-09");
    expect(parseDateToISO("7/9/2026")).toBe("2026-07-09");
    expect(parseDateToISO("07/09/26")).toBe("2026-07-09");
  });

  it("returns null for non-date rows (e.g. a trailing totals row)", () => {
    expect(parseDateToISO("Total")).toBeNull();
    expect(parseDateToISO("")).toBeNull();
  });
});

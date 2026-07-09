import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock lib/supabase.ts so listTransactions takes the Supabase branch without
// a real project. We build a fluent stub matching the exact chain
// listTransactions calls: .from().select().gte().lte().order().range().
// vi.mock() factories are hoisted above imports, so the mock fn itself has
// to be created via vi.hoisted() rather than a plain top-level const.
const { supabaseMock } = vi.hoisted(() => ({ supabaseMock: vi.fn() }));
vi.mock("./supabase", () => ({ supabase: supabaseMock }));

import { listTransactions } from "./transactions";

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

function makeRow(i: number): TxnRow {
  return {
    id: `t_${i}`,
    external_id: `ext_${i}`,
    source: "csv",
    date: "2026-07-01",
    gross: 10,
    tip: 0,
    item_name: "Cut",
    category: "",
    purchase_type: "",
    customer_id: null,
    service_provider_id: null,
    appointment_id: null,
    imported_at: "2026-07-01T00:00:00.000Z",
  };
}

// Mirrors the real query builder's shape closely enough to exercise the
// pagination loop: only .range() actually resolves, everything before it
// just returns `this` to keep the chain going.
function stubClient(rangeImpl: (start: number, end: number) => Promise<{ data: TxnRow[] | null; error: unknown }>) {
  const range = vi.fn(rangeImpl);
  return {
    client: {
      from: () => ({
        select: () => ({
          gte: () => ({
            lte: () => ({
              order: () => ({ range }),
            }),
          }),
        }),
      }),
    },
    range,
  };
}

describe("listTransactions pagination (C-2)", () => {
  beforeEach(() => {
    supabaseMock.mockReset();
  });

  it("pages past Supabase's implicit 1000-row cap to return every row", async () => {
    const total = 2400; // spans 3 pages of 1000
    const all = Array.from({ length: total }, (_, i) => makeRow(i));
    const { client, range } = stubClient((start, end) =>
      Promise.resolve({ data: all.slice(start, end + 1), error: null })
    );
    supabaseMock.mockReturnValue(client);

    const result = await listTransactions("2026-01-01", "2026-12-31");

    expect(result).toHaveLength(total);
    expect(result.map(r => r.id)).toEqual(all.map(r => r.id));
    expect(range).toHaveBeenCalledTimes(3); // 1000 + 1000 + 400 (short page stops the loop)
    expect(range).toHaveBeenNthCalledWith(1, 0, 999);
    expect(range).toHaveBeenNthCalledWith(2, 1000, 1999);
    expect(range).toHaveBeenNthCalledWith(3, 2000, 2999);
  });

  it("stops after a single request when the first page is already short", async () => {
    const all = Array.from({ length: 500 }, (_, i) => makeRow(i));
    const { client, range } = stubClient((start, end) =>
      Promise.resolve({ data: all.slice(start, end + 1), error: null })
    );
    supabaseMock.mockReturnValue(client);

    const result = await listTransactions("2026-01-01", "2026-12-31");

    expect(result).toHaveLength(500);
    expect(range).toHaveBeenCalledTimes(1);
  });

  it("returns an empty list without looping when there are zero rows", async () => {
    const { client, range } = stubClient(() => Promise.resolve({ data: [], error: null }));
    supabaseMock.mockReturnValue(client);

    const result = await listTransactions("2026-01-01", "2026-12-31");

    expect(result).toEqual([]);
    expect(range).toHaveBeenCalledTimes(1);
  });

  it("surfaces a missing-table error with the migration hint instead of paginating forever", async () => {
    const { client } = stubClient(() =>
      Promise.resolve({ data: null, error: { message: "could not find the table 'transactions'", code: "PGRST205" } })
    );
    supabaseMock.mockReturnValue(client);

    await expect(listTransactions("2026-01-01", "2026-12-31")).rejects.toThrow(/run the migration/);
  });
});

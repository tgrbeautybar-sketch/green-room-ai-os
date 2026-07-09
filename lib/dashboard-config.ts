import type { CsvMapping } from "./csv-import";

// Shared between app/api/dashboard/source/route.ts (read/write) and
// app/api/dashboard/metrics/route.ts (read) — kept out of either route file
// so both can import the type without one route importing another.
export type DashboardConfig = {
  cogsPct: number | null; // product/supply cost, % of sales — enables cogs/net tiles when set
  workingHours: number | null; // optional, currently informational only
  csvMapping: CsvMapping | null; // confirmed column mapping, so repeat imports skip the mapping step
};

export const DEFAULT_DASHBOARD_CONFIG: DashboardConfig = {
  cogsPct: null,
  workingHours: null,
  csvMapping: null,
};

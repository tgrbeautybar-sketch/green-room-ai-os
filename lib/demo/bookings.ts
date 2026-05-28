import { stylists } from "./stylists";
import { rng, pick, floatRange, range } from "./rng";

export type Service = {
  name: string;
  basePrice: number;
  durationMin: number;
  costPct: number;
};

const SERVICES: Service[] = [
  { name: "Root Touch-Up",         basePrice: 95,  durationMin: 75,  costPct: 0.18 },
  { name: "Full Highlight",        basePrice: 220, durationMin: 180, costPct: 0.22 },
  { name: "Balayage",              basePrice: 285, durationMin: 210, costPct: 0.24 },
  { name: "Women's Cut + Blowout", basePrice: 85,  durationMin: 60,  costPct: 0.05 },
  { name: "Men's Cut",             basePrice: 45,  durationMin: 30,  costPct: 0.04 },
  { name: "Fade + Beard",          basePrice: 60,  durationMin: 40,  costPct: 0.06 },
  { name: "Brow Wax + Tint",       basePrice: 55,  durationMin: 30,  costPct: 0.08 },
  { name: "Lash Lift",             basePrice: 110, durationMin: 60,  costPct: 0.10 },
  { name: "Extensions Install",    basePrice: 650, durationMin: 240, costPct: 0.45 },
  { name: "Bridal Trial",          basePrice: 175, durationMin: 90,  costPct: 0.07 },
  { name: "Gloss + Style",         basePrice: 115, durationMin: 75,  costPct: 0.16 },
  { name: "Color Correction",      basePrice: 425, durationMin: 300, costPct: 0.28 },
];

const ROLE_SERVICES: Record<string, string[]> = {
  "Stylist":          ["Women's Cut + Blowout", "Root Touch-Up", "Gloss + Style", "Bridal Trial"],
  "Color Specialist": ["Root Touch-Up", "Full Highlight", "Balayage", "Gloss + Style", "Color Correction"],
  "Barber":           ["Men's Cut", "Fade + Beard"],
  "Esthetician":      ["Brow Wax + Tint", "Lash Lift"],
  "Owner":            ["Women's Cut + Blowout", "Full Highlight", "Balayage", "Color Correction"],
};

export type Booking = {
  id: string;
  stylistId: string;
  service: Service;
  daysAgo: number;
  price: number;
  tip: number;
  clientReturning: boolean;
};

function generate(): Booking[] {
  const out: Booking[] = [];
  let idCounter = 0;
  for (const s of stylists) {
    const serviceMenu = ROLE_SERVICES[s.role].map(n => SERVICES.find(x => x.name === n)!);
    const baseR = rng(s.id.charCodeAt(0) * 131 + s.id.length * 17);
    const volume = floatRange(baseR, 0.6, 1.4);
    const daysOfBookings = 90;
    const perDay = s.role === "Barber" ? 4 : s.role === "Esthetician" ? 2 : 2.5;
    const total = Math.floor(perDay * volume * daysOfBookings);
    for (let i = 0; i < total; i++) {
      const r = rng(s.id.charCodeAt(0) * 9999 + i * 311);
      const svc = pick(r, serviceMenu);
      const daysAgo = range(r, 0, daysOfBookings - 1);
      const priceJitter = floatRange(r, 0.95, 1.12);
      const price = Math.round(svc.basePrice * priceJitter);
      const tip = Math.round(price * floatRange(r, 0.12, 0.22));
      const clientReturning = r() < 0.62 + (volume - 1) * 0.1;
      out.push({ id: `bk_${idCounter++}`, stylistId: s.id, service: svc, daysAgo, price, tip, clientReturning });
    }
  }
  return out;
}

export const bookings: Booking[] = generate();
export const services = SERVICES;

export type Metrics = {
  gross: number;
  tips: number;
  cogs: number;
  net: number;
  bookings: number;
  retention: number;
  avgTicket: number;
  topService: string;
};

export function metricsFor(stylistId: string | "all", windowDays = 30): Metrics {
  const set = bookings.filter(
    b => (stylistId === "all" || b.stylistId === stylistId) && b.daysAgo < windowDays
  );
  const gross = set.reduce((a, b) => a + b.price, 0);
  const tips = set.reduce((a, b) => a + b.tip, 0);
  const cogs = Math.round(set.reduce((a, b) => a + b.price * b.service.costPct, 0));
  const returning = set.filter(b => b.clientReturning).length;
  const retention = set.length === 0 ? 0 : returning / set.length;
  const avgTicket = set.length === 0 ? 0 : Math.round(gross / set.length);

  const byService = new Map<string, number>();
  for (const b of set) byService.set(b.service.name, (byService.get(b.service.name) ?? 0) + b.price);
  let topService = "—";
  let topRev = 0;
  for (const [name, rev] of byService) if (rev > topRev) { topRev = rev; topService = name; }

  return { gross, tips, cogs, net: gross - cogs, bookings: set.length, retention, avgTicket, topService };
}

// Daily gross series for a sparkline (most-recent day last).
export function dailySeries(stylistId: string | "all", windowDays = 30): number[] {
  const days = new Array<number>(windowDays).fill(0);
  for (const b of bookings) {
    if (stylistId !== "all" && b.stylistId !== stylistId) continue;
    if (b.daysAgo >= windowDays) continue;
    days[windowDays - 1 - b.daysAgo] += b.price;
  }
  return days;
}

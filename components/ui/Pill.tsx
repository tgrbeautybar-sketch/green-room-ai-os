import { ReactNode } from "react";

export function Pill({ children, tone = "moss" }: { children: ReactNode; tone?: "moss" | "champagne" | "rose" | "neutral" | "ink" }) {
  const tones: Record<string, string> = {
    moss:       "bg-moss-100/70 text-moss-700 border-moss-200",
    champagne:  "bg-champagne-100 text-champagne-600 border-champagne-200",
    rose:       "bg-[#fbe9e3] text-[#9a4a32] border-[#f3cdbf]",
    neutral:    "bg-bone text-muted border-moss-700/10",
    ink:        "bg-moss-800 text-cream border-moss-800",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Illustrative() {
  return <span className="illustrative-pill"><span className="block h-1 w-1 rounded-full bg-champagne-500" /> Illustrative</span>;
}

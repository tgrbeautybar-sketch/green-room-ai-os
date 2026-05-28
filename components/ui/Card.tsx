import { ReactNode } from "react";

export function Card({
  children,
  className = "",
  as: As = "div",
}: { children: ReactNode; className?: string; as?: any }) {
  return (
    <As className={`rounded-2xl border border-moss-700/8 bg-white p-5 shadow-[0_1px_0_rgba(31,61,46,0.04),0_8px_24px_-12px_rgba(31,61,46,0.10)] ${className}`}>
      {children}
    </As>
  );
}

export function CardHead({ eyebrow, title, action }: { eyebrow?: string; title: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        {eyebrow && <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-champagne-600">{eyebrow}</div>}
        <h3 className="mt-1 font-display text-xl font-semibold text-moss-700">{title}</h3>
      </div>
      {action}
    </div>
  );
}

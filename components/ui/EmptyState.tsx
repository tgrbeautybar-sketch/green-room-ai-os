import { ReactNode } from "react";
import { Card } from "./Card";

export function EmptyState({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <Card>
      <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-moss-100/60 text-moss-500">
          <span className="block h-2.5 w-2.5 rounded-full border-2 border-moss-400" />
        </div>
        {eyebrow && (
          <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-champagne-600">{eyebrow}</div>
        )}
        <h3 className="font-display text-lg font-semibold text-moss-700">{title}</h3>
        {description && <p className="max-w-md text-[13px] leading-relaxed text-muted">{description}</p>}
        {action && <div className="mt-2">{action}</div>}
      </div>
    </Card>
  );
}

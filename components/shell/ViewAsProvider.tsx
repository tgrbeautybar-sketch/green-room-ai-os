"use client";

import { createContext, useContext, useState, useMemo, ReactNode } from "react";
import { stylists, OWNER_ID } from "@/lib/demo/stylists";

type ViewAsValue = {
  viewAsId: string; // "all" or a stylist id
  setViewAsId: (id: string) => void;
  isOwnerView: boolean;
};

const Ctx = createContext<ViewAsValue | null>(null);

export function ViewAsProvider({ children }: { children: ReactNode }) {
  const [viewAsId, setViewAsId] = useState<string>("all");
  const value = useMemo<ViewAsValue>(
    () => ({ viewAsId, setViewAsId, isOwnerView: viewAsId === "all" || viewAsId === OWNER_ID }),
    [viewAsId]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useViewAs() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useViewAs must be used inside <ViewAsProvider>");
  return v;
}

export function viewAsOptions() {
  return [{ id: "all", name: "Owner view (all stylists)" }, ...stylists.map(s => ({ id: s.id, name: s.name }))];
}

import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { supabase } from "./supabase";

// Persistence abstraction.
// - Supabase (Postgres) when configured → works on Vercel/serverless.
// - Local files (.data/) fallback → keeps dev working with no external services.
//
// Tables (see docs/supabase-setup.md):
//   app_state(key text pk, value jsonb, updated_at timestamptz)
//   messages(id text pk, type, caller_name, phone, service, preferred_stylist, note, received_at)

const DATA_DIR = path.join(process.cwd(), ".data");

// ---------- key/value state (KB, prompt, dashboard source) ----------

export async function getState<T>(key: string): Promise<T | null> {
  const sb = supabase();
  if (sb) {
    const { data, error } = await sb.from("app_state").select("value").eq("key", key).maybeSingle();
    if (error) throw new Error(`getState(${key}): ${error.message}`);
    return (data?.value as T) ?? null;
  }
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, `${key}.json`), "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// Same as getState, but never throws — callers that would otherwise 500 when
// Supabase is unreachable get `fallback` instead. Use for reads that must stay
// on the happy path (e.g. GET routes backing UI that should degrade, not crash).
export async function safeGetState<T>(key: string, fallback: T): Promise<T> {
  try {
    const value = await getState<T>(key);
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

export async function setState<T>(key: string, value: T): Promise<void> {
  const sb = supabase();
  if (sb) {
    const { error } = await sb
      .from("app_state")
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) throw new Error(`setState(${key}): ${error.message}`);
    return;
  }
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(path.join(DATA_DIR, `${key}.json`), JSON.stringify(value, null, 2), "utf-8");
}

// ---------- captured messages ----------

export type CapturedMessage = {
  id: string;
  type: "message" | "booking";
  callerName: string;
  phone: string;
  service: string;
  preferredStylist: string;
  note: string;
  receivedAt: string;
};

const MSG_FILE = path.join(DATA_DIR, "messages.json");

export async function addMessage(msg: CapturedMessage): Promise<void> {
  const sb = supabase();
  if (sb) {
    const { error } = await sb.from("messages").insert({
      id: msg.id,
      type: msg.type,
      caller_name: msg.callerName,
      phone: msg.phone,
      service: msg.service,
      preferred_stylist: msg.preferredStylist,
      note: msg.note,
      received_at: msg.receivedAt,
    });
    if (error) throw new Error(`addMessage: ${error.message}`);
    return;
  }
  await fs.mkdir(DATA_DIR, { recursive: true });
  const all = await readMessagesFile();
  all.unshift(msg);
  await fs.writeFile(MSG_FILE, JSON.stringify(all.slice(0, 500), null, 2), "utf-8");
}

export async function listMessages(limit = 50): Promise<CapturedMessage[]> {
  const sb = supabase();
  if (sb) {
    const { data, error } = await sb
      .from("messages")
      .select("*")
      .order("received_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(`listMessages: ${error.message}`);
    return (data ?? []).map(r => ({
      id: r.id,
      type: r.type,
      callerName: r.caller_name ?? "",
      phone: r.phone ?? "",
      service: r.service ?? "",
      preferredStylist: r.preferred_stylist ?? "",
      note: r.note ?? "",
      receivedAt: r.received_at,
    }));
  }
  return (await readMessagesFile()).slice(0, limit);
}

async function readMessagesFile(): Promise<CapturedMessage[]> {
  try {
    return JSON.parse(await fs.readFile(MSG_FILE, "utf-8")) as CapturedMessage[];
  } catch {
    return [];
  }
}

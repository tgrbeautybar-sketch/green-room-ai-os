import "server-only";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Server-side Supabase client using the SECRET key (new `sb_secret_...` format,
// or the legacy service_role key). Never exposed to the browser — bypasses RLS.
// Env-gated: if not configured, the app falls back to local files so dev keeps
// working. On Vercel (serverless, read-only FS) Supabase is required.
const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabaseEnabled = !!url && !!serviceKey;
export const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || "post-media";

let client: SupabaseClient | null = null;
export function supabase(): SupabaseClient | null {
  if (!supabaseEnabled) return null;
  if (!client) {
    client = createClient(url!, serviceKey!, { auth: { persistSession: false } });
  }
  return client;
}

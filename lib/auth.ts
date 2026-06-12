// Single-owner auth for the Green Room OS (Belinda-only V1).
// Edge-safe: uses Web Crypto only — importable from middleware AND route handlers.

export const SESSION_COOKIE = "gr_session";

const enc = new TextEncoder();

async function hmacHex(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

/** The opaque session value stored in the cookie. Deterministic per-secret. */
export function sessionToken(secret: string): Promise<string> {
  return hmacHex("green-room-owner-v1", secret);
}

export function authSecret(): string {
  return process.env.SESSION_SECRET || "dev-insecure-secret-change-me";
}

export function appPassword(): string {
  return process.env.APP_PASSWORD || "greenroom";
}

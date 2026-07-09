import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, sessionToken, authSecret } from "@/lib/auth";

// Everything is protected except the login page, auth endpoints, and inbound
// webhooks (external services can't carry the owner's session cookie — those
// secure themselves with a shared secret instead).
function isPublic(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname === "/privacy" ||
    pathname === "/sms-terms" ||
    pathname === "/sms-signup" ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/hooks") ||
    pathname.startsWith("/api/media") || // public so Instagram/Zernio can fetch post images
    pathname === "/api/health" || // public so Vercel Cron can ping it to keep Supabase warm
    pathname.startsWith("/api/cron") // public so Vercel Cron can trigger these — each secures itself with CRON_SECRET
  );
}

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const expected = await sessionToken(authSecret());

  if (token && token === expected) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("from", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Run on everything except Next internals and static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

import { NextRequest, NextResponse } from "next/server";
import { STAFF_COOKIE_NAME, isValidStaffSessionToken } from "@/lib/auth";

function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname.startsWith("/api/auth/") ||
    // Unauthenticated on purpose: the Capacitor connect screen probes this
    // cross-origin before the WebView has navigated into the app at all,
    // i.e. before any login is possible. Reveals only liveness + LAN IPs.
    pathname === "/api/health"
  );
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  const token = req.cookies.get(STAFF_COOKIE_NAME)?.value;
  if (await isValidStaffSessionToken(token)) return NextResponse.next();

  const loginUrl = new URL("/login", req.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

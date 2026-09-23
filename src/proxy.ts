import { NextResponse, type NextRequest } from "next/server";

/**
 * Route protection (Next 16's `proxy` convention, formerly `middleware`).
 *
 * This is a fast cookie presence check only — it keeps signed-out visitors
 * from loading the app shell and bouncing. It is NOT the security boundary:
 * every API route independently verifies the session and the project's
 * owner (see lib/apiHelpers.ts), because a cookie's mere existence proves
 * nothing.
 */
const PROTECTED_PREFIXES = ["/project", "/dashboard"];
const AUTH_ROUTES = ["/login", "/register"];

/**
 * A single-user desktop install has no accounts, so there is nothing to
 * redirect to. The env var is set by the desktop shell alongside the
 * embedded database.
 */
const singleUser = Boolean(process.env.INKSHORE_DB_DIR || process.env.INKDROP_DB_DIR);

const SESSION_COOKIES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
];

function hasSessionCookie(req: NextRequest): boolean {
  return SESSION_COOKIES.some((name) => req.cookies.has(name));
}

/**
 * A top-level page load, as opposed to one of the router's background RSC
 * fetches. Sent by every browser that supports fetch metadata; treated as a
 * navigation when absent so older clients keep the redirect.
 */
function isNavigation(req: NextRequest): boolean {
  const mode = req.headers.get("sec-fetch-mode");
  return mode === null || mode === "navigate";
}

export default function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const signedIn = hasSessionCookie(req);

  if (singleUser) return NextResponse.next();

  if (PROTECTED_PREFIXES.some((p) => pathname.startsWith(p)) && !signedIn) {
    const url = new URL("/login", req.url);
    // Come back to where they were headed after signing in.
    url.searchParams.set("callbackUrl", pathname + search);
    return NextResponse.redirect(url);
  }

  // Only bounce a signed-in visitor off /login on a real navigation. The
  // router also fetches these routes in the background (prefetch, cache
  // refresh), and redirecting one of those is worse than useless: Next
  // strips the RSC headers before the proxy runs, so it can't mark the
  // redirect as an RSC hop, and the browser follows it as a plain request
  // and gets a 404 it then caches. Fetch metadata is the only signal left
  // that survives into the proxy — `navigate` means the address bar is
  // actually moving.
  if (AUTH_ROUTES.includes(pathname) && signedIn && isNavigation(req)) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Everything except Next internals, the auth API and static assets.
    "/((?!api/auth|api/health|_next/static|_next/image|favicon.ico|logo.png|.*\\.svg).*)",
  ],
};

import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/server/auth/config.edge";
import { canOpenPortal, isStaff, portalForRole } from "@/server/auth/rbac";

const { auth } = NextAuth(authConfig);

const PORTALS = ["/app", "/work", "/admin"];
const AUTH_PAGES = ["/login", "/signup"];
const SUPPORTED_MARKETS = ["US", "UK", "CA", "AU", "IN"];

function isUnder(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * Route protection (SPEC §5):
 * - /app, /work, /admin require a session; otherwise /login?next=…
 * - staff must complete TOTP 2FA (/2fa) before any portal
 * - wrong role → /403
 * - students without a profile → /signup/complete; not onboarded → /app/onboarding
 * Also sets the `market` cookie from the visitor's country (SPEC §6.1).
 */
export default auth((req) => {
  const { nextUrl } = req;
  const pathname = nextUrl.pathname;
  const user = req.auth?.user;


  const inPortal = PORTALS.some((p) => isUnder(pathname, p));

  if (inPortal) {
    if (!user?.id) {
      const url = new URL("/login", nextUrl);
      url.searchParams.set("next", pathname + nextUrl.search);
      return NextResponse.redirect(url);
    }
    if (isStaff(user.role) && user.mfa !== "ok") {
      return NextResponse.redirect(new URL("/2fa", nextUrl));
    }
    if (!canOpenPortal(user.role, pathname)) {
      return NextResponse.rewrite(new URL("/403", nextUrl), { status: 403 });
    }
    if (user.role === "STUDENT") {
      if (user.needsProfile) return NextResponse.redirect(new URL("/signup/complete", nextUrl));
      const allowedBeforeOnboarding = ["/app/onboarding", "/app/billing", "/app/settings", "/app/checkout"];
      if (!user.onboarded && !allowedBeforeOnboarding.some((p) => isUnder(pathname, p))) {
        return NextResponse.redirect(new URL("/app/onboarding", nextUrl));
      }
    }
  }

  if (pathname === "/2fa" && (!user?.id || !isStaff(user.role))) {
    return NextResponse.redirect(new URL("/login", nextUrl));
  }

  // Signed-in users skip the login/signup pages.
  if (user?.id && AUTH_PAGES.includes(pathname) && !(isStaff(user.role) && user.mfa !== "ok")) {
    if (!(pathname === "/signup" && nextUrl.searchParams.has("plan"))) {
      const next = nextUrl.searchParams.get("next");
      const dest = next && next.startsWith("/") && !next.startsWith("//") ? next : portalForRole(user.role);
      return NextResponse.redirect(new URL(dest, nextUrl));
    }
  }

  const res = NextResponse.next();

  // Market detection: ?market= override → cookie → geo header → US.
  const override = nextUrl.searchParams.get("market")?.toUpperCase();
  const current = req.cookies.get("market")?.value;
  const geo = req.headers.get("x-vercel-ip-country")?.toUpperCase();
  const pick = (c?: string | null) => (c && SUPPORTED_MARKETS.includes(c === "GB" ? "UK" : c) ? (c === "GB" ? "UK" : c) : null);
  const market = pick(override) ?? pick(current) ?? pick(geo) ?? "US";
  if (market !== current) {
    res.cookies.set("market", market, { path: "/", maxAge: 60 * 60 * 24 * 180, sameSite: "lax" });
  }
  return res;
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icon|apple-icon|opengraph-image|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|svg|webp|ico|woff2?)$).*)"],
};

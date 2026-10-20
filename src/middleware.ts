import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/server/auth/config.edge";
import { canOpenPortal, isStaff, portalForRole } from "@/server/auth/rbac";
import { verifyViewAs, VIEW_AS_COOKIE } from "@/server/auth/view-as.edge";
import { homePathForMarket, resolveMarket } from "@/lib/market";

const { auth } = NextAuth(authConfig);

const PORTALS = ["/app", "/work", "/admin", "/coach"];
const AUTH_PAGES = ["/login", "/signup"];

function isUnder(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * Route protection (SPEC §5):
 * - /app, /work, /admin, /coach require a session; otherwise /login?next=…
 * - staff must complete TOTP 2FA (/2fa) before any portal
 * - wrong role → /403
 * - students without a profile → /signup/complete; not onboarded → /app/onboarding
 * Also sets the `market` cookie from the visitor's country (SPEC §6.1) and
 * serves the visitor's country homepage at `/` (D-141): IN → /in, UK → /uk,
 * everyone else the US page. The URL stays `/`; /in and /uk also work directly.
 */
export default auth(async (req) => {
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
    // ADMIN "viewing as" a student may open /app read-only while the signed cookie is valid (D-120).
    if (user.role === "ADMIN" && isUnder(pathname, "/app")) {
      const v = await verifyViewAs(process.env.AUTH_SECRET ?? "", req.cookies.get(VIEW_AS_COOKIE)?.value);
      if (v && v.adminId === user.id) return NextResponse.next();
      const res = NextResponse.redirect(new URL("/admin/students", nextUrl));
      if (req.cookies.get(VIEW_AS_COOKIE)) res.cookies.delete(VIEW_AS_COOKIE);
      return res;
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

  // Market detection (pure helper in src/lib/market.ts): ?market= override → cookie → geo header → US.
  const current = req.cookies.get("market")?.value;
  const market = resolveMarket({ override: nextUrl.searchParams.get("market"), cookie: current, // Vercel sets x-vercel-ip-country; behind Cloudflare (e.g. the VPS test site) it is cf-ipcountry.
  geo: req.headers.get("x-vercel-ip-country") ?? req.headers.get("cf-ipcountry") });
  const home = pathname === "/" ? homePathForMarket(market) : "/";
  const res = home !== "/" ? NextResponse.rewrite(new URL(home + nextUrl.search, nextUrl)) : NextResponse.next();

  // Referral attribution (D-113): remember ?ref=CODE for 30 days so a later signup is still credited.
  const ref = nextUrl.searchParams.get("ref");
  if (ref && /^[A-Za-z0-9]{6,12}$/.test(ref) && req.cookies.get("ref")?.value !== ref.toUpperCase()) {
    res.cookies.set("ref", ref.toUpperCase(), { path: "/", maxAge: 60 * 60 * 24 * 30, sameSite: "lax" });
  }

  if (market !== current) {
    res.cookies.set("market", market, { path: "/", maxAge: 60 * 60 * 24 * 180, sameSite: "lax" });
  }
  return res;
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icon|apple-icon|opengraph-image|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|svg|webp|ico|woff2?)$).*)"],
};

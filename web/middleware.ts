import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * English lives at the unprefixed paths it has always lived at, and Japanese
 * at /ja/... . Internally both are the same route tree under app/[lang], so
 * this rewrites every unprefixed page request to /en without the address bar
 * ever knowing. A rewrite, not a redirect: the public paths are the public
 * paths, and moving English under a prefix would have broken every URL
 * anybody holds.
 *
 * The matcher skips _next and anything with a dot in it, which is every real
 * file: the assets in public/, the metadata routes (/icon.svg, /robots.txt,
 * /manifest.webmanifest), and the explorer's data files that nginx serves
 * before Next ever sees them in production.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/ja" || pathname.startsWith("/ja/")) return;
  const url = request.nextUrl.clone();
  url.pathname = `/en${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};

import { NextResponse, type NextRequest } from "next/server";

import { LOCALE_COOKIE, isLocale } from "@/lib/i18n";
import { safeNext } from "@/lib/request";
import { localizePath, resolvePath } from "@/lib/routes";

/** GET /lang?l=en&next=/search… : stores the language and goes back. */
export function GET(request: NextRequest) {
  const l = request.nextUrl.searchParams.get("l");
  const raw = safeNext(request.nextUrl.searchParams.get("next"));
  // The same page in the chosen language (localized URLs, TEC-1285); the
  // query and hash stay.
  const cut = raw.search(/[?#]/);
  const pathname = cut === -1 ? raw : raw.slice(0, cut);
  const next = isLocale(l)
    ? localizePath(resolvePath(pathname).path, l) +
      (cut === -1 ? "" : raw.slice(cut))
    : raw;
  const res = new NextResponse(null, {
    status: 303,
    headers: { Location: next },
  });
  if (isLocale(l)) {
    res.cookies.set(LOCALE_COOKIE, l, {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return res;
}

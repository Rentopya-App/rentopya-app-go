import { NextResponse, type NextRequest } from "next/server";

import {
  EMBED_HEADER,
  EMBED_TTL,
  embedFrameHeaders,
  openEmbed,
  sealEmbed,
} from "@/lib/embed";

import { ApiError } from "@/lib/api";
import { sentryConfig } from "@/lib/app-env";
import { newNonce, sentryReportUri, sitePolicy } from "@/lib/csp";
import {
  PREVIEW_COOKIE,
  PREVIEW_HEADER,
  PREVIEW_PARAM,
  frameHeaders,
  previewCookieOptions,
  previewToken,
} from "@/lib/preview";
import { LOCALE_COOKIE, isLocale } from "@/lib/i18n";
import { LOCALE_HEADER, PATH_HEADER, forwardedForFrom } from "@/lib/request";
import { localizePath, resolvePath } from "@/lib/routes";
import { resolveSite } from "@/lib/resolve";
import { safeGa4Id } from "@/lib/theme";
import {
  SESSION_COOKIE,
  SESSION_HEADER,
  decodeSession,
  encodeSession,
  mintSession,
  needsBookingSession,
  sessionCookieOptions,
  usableSession,
} from "@/lib/session";

/** Internal headers the proxy owns; client copies are always dropped. */
/** The request's CSP nonce, for pages that render their own <Script>. */
export const NONCE_HEADER = "x-nonce";
const REPORT_ONLY = "content-security-policy-report-only";

const INTERNAL_HEADERS = [
  NONCE_HEADER,
  REPORT_ONLY,
  SESSION_HEADER,
  PATH_HEADER,
  LOCALE_HEADER,
  PREVIEW_HEADER,
  EMBED_HEADER,
];

const plainPage = (status: number, title: string, body: string) => {
  const res = new NextResponse(
    `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title><style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px;color:#0f172a;background:#f8fafc;text-align:center}h1{font-size:1.25rem}p{color:#475569}</style></head><body><main><h1>${title}</h1><p>${body}</p></main></body></html>`,
    {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    },
  );
  for (const [k, v] of Object.entries(frameHeaders(null)))
    res.headers.set(k, v);
  return res;
};

/**
 * Every page request: the Host names the site (unknown host → a neutral
 * 404 that shows no organization), and visitors get a booking session for
 * this site's origin when booking is on. A preview token (query or cookie)
 * renders the draft instead; only the panel may frame such a page.
 */
export async function proxy(request: NextRequest) {
  const ip = forwardedForFrom(request.headers);
  const embed =
    request.nextUrl.pathname === "/embed" ||
    request.nextUrl.pathname.startsWith("/embed/");
  const fromQuery = previewToken(
    request.nextUrl.searchParams.get(PREVIEW_PARAM),
  );
  const preview = embed
    ? ""
    : fromQuery || previewToken(request.cookies.get(PREVIEW_COOKIE)?.value);
  let site;
  try {
    site = await resolveSite(request.headers.get("host"), ip, preview);
  } catch (err) {
    if (preview && err instanceof ApiError && err.status === 401) {
      const res = plainPage(
        401,
        "Önizleme bağlantısının süresi doldu / Preview link expired",
        "Panelden yeni bir önizleme açın. Open a new preview from the panel.",
      );
      res.cookies.delete(PREVIEW_COOKIE);
      return res;
    }
    return plainPage(
      503,
      "Geçici bir sorun var / Temporarily unavailable",
      "Lütfen biraz sonra tekrar deneyin. Please try again shortly.",
    );
  }
  if (!site) {
    return plainPage(
      404,
      "Site bulunamadı / Site not found",
      "Bu adreste yayında bir site yok. There is no site at this address.",
    );
  }

  // A preview link opened as a page moves its token into the cookie and
  // drops it from the URL, so it stays out of the history, logs and
  // Referer (TEC-1289). Framed previews (the panel) keep the query: a
  // partitioned cookie is not guaranteed there, and no-referrer applies.
  if (
    site.preview &&
    fromQuery &&
    !embed &&
    request.method === "GET" &&
    request.headers.get("sec-fetch-dest") === "document"
  ) {
    const url = request.nextUrl.clone();
    url.searchParams.delete(PREVIEW_PARAM);
    const res = NextResponse.redirect(url, 303);
    res.cookies.set(PREVIEW_COOKIE, fromQuery, previewCookieOptions(fromQuery));
    res.headers.set("Referrer-Policy", "no-referrer");
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  }

  // TEC-1286: a nonce per request; Next reads it from the request's CSP
  // header and stamps its own scripts. Report-only until violations are
  // reviewed in Sentry.
  const nonce = newNonce();
  const sentry = sentryConfig();
  const cspReportOnly = sitePolicy({
    nonce,
    ga4:
      embed || site.preview
        ? null
        : safeGa4Id(site.config.analytics?.ga4_measurement_id),
    reportUri: sentryReportUri(
      sentry?.dsn,
      sentry?.environment,
      sentry?.release,
    ),
    dev: process.env.NODE_ENV !== "production",
  });
  const withCsp = (h: Headers) => {
    h.set(NONCE_HEADER, nonce);
    h.set(REPORT_ONLY, cspReportOnly);
  };

  if (embed) {
    const frame = (res: NextResponse) => {
      for (const [k, v] of Object.entries(
        embedFrameHeaders(site.config.widget?.allowed_domains ?? []),
      ))
        res.headers.set(k, v);
      res.headers.delete("X-Frame-Options");
      res.headers.set("Content-Security-Policy-Report-Only", cspReportOnly);
      return res;
    };
    const suppliedKey = request.nextUrl.searchParams.get("key");
    if (suppliedKey && suppliedKey !== site.publishable_key)
      return frame(
        plainPage(403, "Widget", "Geçersiz site anahtarı / Invalid site key"),
      );
    if (!site.booking_enabled || !site.publishable_key)
      return frame(
        plainPage(
          403,
          "Widget",
          "Çevrimiçi rezervasyon kapalı / Online booking unavailable",
        ),
      );
    let state = openEmbed(request.nextUrl.searchParams.get("s"), site.origin);
    if (!state) {
      // Never replace a stale booking action with a different visitor session.
      if (request.method !== "GET" || request.nextUrl.searchParams.has("s"))
        return frame(
          plainPage(410, "Widget", "Oturum süresi doldu / Session expired"),
        );
      try {
        const session = await mintSession(site, ip);
        state = {
          origin: site.origin,
          expires: Math.min(
            session.e,
            Math.floor(Date.now() / 1000) + EMBED_TTL,
          ),
          session,
        };
        const url = request.nextUrl.clone();
        url.searchParams.delete("key");
        url.searchParams.set("s", sealEmbed(state));
        return frame(NextResponse.redirect(url));
      } catch {
        return frame(
          plainPage(
            503,
            "Widget",
            "Geçici bir sorun var / Temporarily unavailable",
          ),
        );
      }
    }
    const headers = new Headers(request.headers);
    for (const h of INTERNAL_HEADERS) headers.delete(h);
    headers.set(EMBED_HEADER, "1");
    withCsp(headers);
    headers.set(PATH_HEADER, request.nextUrl.pathname + request.nextUrl.search);
    headers.set(SESSION_HEADER, state.session.t);
    return frame(NextResponse.next({ request: { headers } }));
  }

  // Localized URLs (TEC-1285): "/araclar" renders the "/vehicles" route in
  // Turkish. A path in a language the site does not offer moves to the same
  // page in the site's default language.
  const { path: internalPath, locale: pathLocale } = resolvePath(
    request.nextUrl.pathname,
  );
  if (pathLocale && !site.locales.includes(pathLocale)) {
    const fallback = isLocale(site.default_locale)
      ? site.default_locale
      : (site.locales.find(isLocale) ?? "tr");
    const url = request.nextUrl.clone();
    url.pathname = localizePath(internalPath, fallback);
    if (url.pathname !== request.nextUrl.pathname)
      return NextResponse.redirect(url, 308);
  }

  const headers = new Headers(request.headers);
  for (const h of INTERNAL_HEADERS) headers.delete(h);
  withCsp(headers);
  headers.set(PATH_HEADER, internalPath + request.nextUrl.search);
  if (pathLocale && site.locales.includes(pathLocale))
    headers.set(LOCALE_HEADER, pathLocale);
  if (site.preview && preview) headers.set(PREVIEW_HEADER, preview);

  let fresh: ReturnType<typeof decodeSession> = null;
  if (site.booking_enabled && site.publishable_key) {
    const stored = decodeSession(request.cookies.get(SESSION_COOKIE)?.value);
    if (usableSession(stored, site)) {
      headers.set(SESSION_HEADER, stored.t);
    } else if (needsBookingSession(internalPath, request.method)) {
      // Only the booking flow mints at render: crawlers and visitors reading
      // content pages never open sessions (TEC-1280).
      try {
        fresh = await mintSession(site, ip);
        headers.set(SESSION_HEADER, fresh.t);
      } catch {
        // Booking pages show their own error; content pages still render.
      }
    }
  }

  let response: NextResponse;
  if (internalPath !== request.nextUrl.pathname) {
    const url = request.nextUrl.clone();
    url.pathname = internalPath;
    response = NextResponse.rewrite(url, { request: { headers } });
  } else {
    response = NextResponse.next({ request: { headers } });
  }
  // The language of the URL becomes the visitor's choice for neutral pages.
  if (
    pathLocale &&
    headers.get(LOCALE_HEADER) === pathLocale &&
    request.cookies.get(LOCALE_COOKIE)?.value !== pathLocale
  ) {
    response.cookies.set(LOCALE_COOKIE, pathLocale, {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  for (const [k, v] of Object.entries(
    frameHeaders(
      site.preview ? { panelOrigin: site.panel_origin ?? "" } : null,
    ),
  )) {
    response.headers.set(k, v);
  }
  // Sealed state and payment tokens never leave in a Referer or a cache.
  if (
    request.nextUrl.searchParams.has("s") ||
    request.nextUrl.searchParams.has("payment")
  ) {
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("Cache-Control", "private, no-store");
  }
  if (site.preview) {
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("X-Robots-Tag", "noindex");
    response.headers.set("Referrer-Policy", "no-referrer");
    if (fromQuery) {
      response.cookies.set(
        PREVIEW_COOKIE,
        fromQuery,
        previewCookieOptions(fromQuery),
      );
    }
  }
  if (fresh) {
    response.cookies.set(
      SESSION_COOKIE,
      encodeSession(fresh),
      sessionCookieOptions(site),
    );
  }
  response.headers.set("Content-Security-Policy-Report-Only", cspReportOnly);
  return response;
}

export const config = {
  matcher: ["/((?!_next/|health|media/|favicon.ico).*)"],
};

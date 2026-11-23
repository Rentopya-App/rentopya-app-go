import type { NextRequest } from "next/server";

import { ApiError, apiFetch } from "@/lib/api";
import { isLocale } from "@/lib/i18n";
import { forwardedForFrom } from "@/lib/request";
import type { Locale } from "@/lib/types";
import { resolveSite } from "@/lib/resolve";
import { buildSitemapXml, type SitemapEntry } from "@/lib/sitemap";

export const dynamic = "force-dynamic";

/**
 * sitemap.xml of the request host's published site (TEC-785): the API
 * lists the public paths, the site writes absolute URLs on the site's
 * origin. Unknown hosts and unpublished sites answer 404.
 */
export async function GET(request: NextRequest) {
  const ip = forwardedForFrom(request.headers);
  const site = await resolveSite(request.headers.get("host"), ip).catch(
    () => null,
  );
  if (!site) return new Response(null, { status: 404 });
  let entries: SitemapEntry[];
  try {
    entries = await apiFetch<SitemapEntry[]>(
      `/v1/public/site/sitemap?host=${encodeURIComponent(site.host)}`,
      { forwardedFor: ip },
    );
  } catch (err) {
    return new Response(null, {
      status: err instanceof ApiError && err.status === 404 ? 404 : 503,
    });
  }
  const locales = site.locales.filter(isLocale);
  const languages = {
    locales: locales.length ? locales : (["tr"] as Locale[]),
    defaultLocale: isLocale(site.default_locale) ? site.default_locale : "tr",
  };
  return new Response(buildSitemapXml(site.origin, entries, languages), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

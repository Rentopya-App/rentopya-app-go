/**
 * sitemap.xml (TEC-785; pure: node --test imports it). The API lists the
 * published site's public paths (GET /v1/public/site/sitemap); the site
 * owns the XML and the origin: every <loc> is the request's site origin
 * plus a validated relative path.
 */

import { localizePath } from "./routes.ts";
import type { Locale } from "./types";

export type SitemapEntry = { path: string; locale?: string; lastmod: string };

/** Sitemap protocol limit per file. */
export const MAX_URLS = 50_000;

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

export function xmlEscape(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** `https://host[:port]` without a path, or null. */
export function sitemapOrigin(raw: string | null | undefined): string | null {
  try {
    const u = new URL(raw ?? "");
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (u.username || u.password) return null;
    return u.origin;
  } catch {
    return null;
  }
}

/** A root-relative path without control characters or `//`. */
export function sitemapPath(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//"))
    return null;
  if (raw.length > 2000 || /[\\\s\u0000-\u001f\u007f]/.test(raw)) return null;
  return raw;
}

/** The site's languages, for localized URLs and hreflang alternates. */
export type SitemapLanguages = { locales: Locale[]; defaultLocale: Locale };

export function buildSitemapXml(
  origin: string,
  entries: SitemapEntry[] | null | undefined,
  languages?: SitemapLanguages,
): string {
  const base = sitemapOrigin(origin);
  const seen = new Set<string>();
  const urls: string[] = [];
  const offered = languages?.locales.length ? languages.locales : null;
  for (const e of Array.isArray(entries) ? entries : []) {
    if (!base || urls.length >= MAX_URLS) break;
    const path = sitemapPath(e?.path);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    const time = typeof e.lastmod === "string" ? Date.parse(e.lastmod) : NaN;
    const lastmod = Number.isNaN(time)
      ? ""
      : `<lastmod>${new Date(time).toISOString()}</lastmod>`;
    if (!offered || !languages) {
      urls.push(`<url><loc>${xmlEscape(base + path)}</loc>${lastmod}</url>`);
      continue;
    }
    // A page in one language (an article) is listed in that language only;
    // other pages once per offered language, each naming the others
    // (localized URLs, TEC-1285).
    const own: Locale[] =
      e.locale === "tr" || e.locale === "en" ? [e.locale] : offered;
    const links =
      own.length > 1
        ? own
            .map(
              (l) =>
                `<xhtml:link rel="alternate" hreflang="${l}" href="${xmlEscape(base + localizePath(path, l))}"/>`,
            )
            .join("") +
          `<xhtml:link rel="alternate" hreflang="x-default" href="${xmlEscape(base + localizePath(path, languages.defaultLocale))}"/>`
        : "";
    for (const l of own) {
      if (urls.length >= MAX_URLS) break;
      urls.push(
        `<url><loc>${xmlEscape(base + localizePath(path, l))}</loc>${lastmod}${links}</url>`,
      );
    }
  }
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    languages
      ? '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">'
      : '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");
}

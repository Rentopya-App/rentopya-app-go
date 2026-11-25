import type { Locale } from "./types";

/**
 * Localized site URLs (TEC-1285). The app's route folders use the English
 * paths; every page also answers on its Turkish path, which the proxy
 * rewrites to the English one. A language-specific path names the page's
 * language (`/araclar` is Turkish, `/vehicles` English); neutral paths (`/`,
 * the embed, media, payment hand-offs) keep the visitor's chosen language.
 *
 * Code links with the internal (English) path and localizes it through
 * `localizePath` (Ctx.href), so one table drives links, rewrites, canonical
 * URLs, hreflang alternates and the sitemap. Pure: node --test runs it.
 */
export const ROUTES = {
  vehicles: { en: "vehicles", tr: "araclar" },
  branches: { en: "branches", tr: "subeler" },
  campaigns: { en: "campaigns", tr: "kampanyalar" },
  corporate: { en: "corporate", tr: "kurumsal" },
  franchise: { en: "franchise", tr: "bayilik" },
  guide: { en: "guide", tr: "rehber" },
  search: { en: "search", tr: "ara" },
  lookup: { en: "lookup", tr: "rezervasyon-sorgula" },
  book: { en: "book", tr: "kirala" },
  reservation: { en: "reservation", tr: "rezervasyon" },
  login: { en: "login", tr: "giris" },
  account: { en: "account", tr: "hesabim" },
  about: { en: "about", tr: "hakkimizda" },
  faq: { en: "faq", tr: "sss" },
  contact: { en: "contact", tr: "iletisim" },
  terms: { en: "terms", tr: "kiralama-kosullari" },
  privacy: { en: "privacy", tr: "kvkk" },
  subscription: { en: "subscription", tr: "abonelik" },
} as const satisfies Record<string, Record<Locale, string>>;

type Segment = { en: string; tr: string };
const BY_SEGMENT = new Map<string, { route: Segment; locale: Locale }>();
for (const route of Object.values(ROUTES) as Segment[]) {
  BY_SEGMENT.set(route.en, { route, locale: "en" });
  BY_SEGMENT.set(route.tr, { route, locale: "tr" });
}

function split(path: string): { first: string; rest: string; tail: string } {
  const cut = path.search(/[?#]/);
  const pathname = cut === -1 ? path : path.slice(0, cut);
  const tail = cut === -1 ? "" : path.slice(cut);
  const m = /^\/([^/]*)(.*)$/.exec(pathname);
  if (!m) return { first: "", rest: pathname, tail };
  return { first: m[1] ?? "", rest: m[2] ?? "", tail };
}

/**
 * The URL of a site path in a language: "/vehicles?x=1" → "/araclar?x=1" for
 * tr. Paths outside the table (and absolute URLs) are returned unchanged.
 */
export function localizePath(path: string, locale: Locale): string {
  if (!path.startsWith("/") || path.startsWith("//")) return path;
  const { first, rest, tail } = split(path);
  const hit = BY_SEGMENT.get(first);
  if (!hit) return path;
  return `/${hit.route[locale]}${rest}${tail}`;
}

/**
 * The internal (English) pathname of a request path and the language the
 * path names ("/araclar/x" → { path: "/vehicles/x", locale: "tr" }); locale
 * is null for neutral paths.
 */
export function resolvePath(pathname: string): {
  path: string;
  locale: Locale | null;
} {
  const { first, rest } = split(pathname);
  const hit = BY_SEGMENT.get(first);
  if (!hit) return { path: pathname, locale: null };
  return { path: `/${hit.route.en}${rest}`, locale: hit.locale };
}

/** The path in every language, for hreflang alternates and the sitemap. */
export function alternates(path: string): Record<Locale, string> {
  return { tr: localizePath(path, "tr"), en: localizePath(path, "en") };
}

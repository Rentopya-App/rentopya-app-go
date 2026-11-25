import "server-only";

/**
 * The organization's live branded site (TEC-1284), read server-side from the
 * portal info. The customer area lives on the site, so the panel portal
 * sends its visitors there; null keeps the panel portal (no live site, or
 * the API could not answer).
 */
export async function portalSite(
  orgSlug: string,
): Promise<{ url: string; locale: "tr" | "en" } | null> {
  if (!/^[a-z0-9-]{1,80}$/.test(orgSlug)) return null;
  const api = (process.env.API_URL || "http://127.0.0.1:8080/v1")
    .replace(/\/+$/, "")
    .replace(/\/v1$/, "");
  try {
    const res = await fetch(
      `${api}/v1/customer/${encodeURIComponent(orgSlug)}`,
      {
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(3000),
      },
    );
    if (!res.ok) return null;
    const site = (await res.json())?.data?.site;
    if (!site || typeof site.url !== "string") return null;
    const url = new URL(site.url);
    const local =
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname.endsWith(".localhost"));
    if ((url.protocol !== "https:" && !local) || url.pathname !== "/")
      return null;
    return { url: url.origin, locale: site.locale === "en" ? "en" : "tr" };
  } catch {
    return null;
  }
}

/** The customer area path on the site in its language. */
export function siteAccountPath(locale: "tr" | "en", uuid?: string): string {
  const base = locale === "en" ? "/account" : "/hesabim";
  return uuid ? `${base}/${encodeURIComponent(uuid)}` : base;
}

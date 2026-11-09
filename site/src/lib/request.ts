/** Current path + query, set by the proxy for server components. */
export const PATH_HEADER = "x-rtp-path";

/** One X-Forwarded-For hop: an IPv4 / IPv6 address, optionally with a port. */
const HOP = /^[0-9a-fA-F:.[\]]{2,47}$/;

/**
 * The X-Forwarded-For chain to send to the API for the visitor ("" when the
 * request carries none). The site does not pick a hop itself: left-most
 * entries are client-controlled. It forwards the chain the edge proxy
 * (Traefik) built, and the API walks it right-to-left, believing only hops
 * appended by trusted proxies (TRUSTED_PROXIES; platform/clientip). X-Real-IP
 * is used only when there is no X-Forwarded-For at all, so a client-supplied
 * value can never outrank the edge's real one. Malformed hops are dropped.
 */
export function forwardedForFrom(headers: Headers): string {
  const hops = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((hop) => hop.trim())
    .filter((hop) => HOP.test(hop));
  const real = headers.get("x-real-ip")?.trim();
  if (hops.length === 0 && real && HOP.test(real)) hops.push(real);
  return hops.join(", ");
}

/**
 * A same-site path to go back to after an action ("/" when the value could
 * leave the site: absolute URLs, protocol-relative paths, backslashes).
 */
export function safeNext(raw: string | null | undefined): string {
  const v = (raw ?? "").trim();
  if (
    !v.startsWith("/") ||
    v.startsWith("//") ||
    v.includes("\\") ||
    v.length > 1000
  ) {
    return "/";
  }
  return v;
}

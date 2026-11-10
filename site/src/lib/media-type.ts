/**
 * Image types the site's /media route passes through (TEC-1170). The API
 * only stores sniffed raster images, but the route is same-origin with the
 * site's pages: an active type (SVG, which runs script when opened
 * directly) must never be served from it, whatever the upstream says.
 */
const RASTER = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
]);

/** The normalised raster image type, or "" when it must not be served. */
export function safeImageType(raw: string | null | undefined): string {
  const type = (raw ?? "").split(";")[0]!.trim().toLowerCase();
  return RASTER.has(type) ? type : "";
}

/** Headers of a passed-through image (no sniffing, no script, no framing). */
export const MEDIA_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; sandbox",
} as const;

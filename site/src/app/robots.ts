import type { MetadataRoute } from "next";

import { indexable } from "@/lib/app-env";
import { alternates } from "@/lib/routes";
import { getSite } from "@/lib/server";

export const dynamic = "force-dynamic";

/**
 * Per host: booking steps are not indexed; the sitemap is per host too.
 * Outside APP_ENV=production (staging) nothing is indexed.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const site = await getSite();
  if (!indexable()) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Booking steps and personal pages in every language (TEC-1285).
      // Robots rules match prefixes: "/ara" alone would also hide "/araclar",
      // so the search page is matched exactly ("$") or with its query ("?").
      disallow: [
        ...(["/book/", "/reservation/", "/account", "/login"] as const).flatMap(
          (p) => Object.values(alternates(p)),
        ),
        ...Object.values(alternates("/search")).flatMap((p) => [
          `${p}$`,
          `${p}?`,
        ]),
      ],
    },
    host: site.origin,
    sitemap: `${site.origin}/sitemap.xml`,
  };
}

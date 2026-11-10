import type { MetadataRoute } from "next";

import { publicMetadataBase } from "@/features/legal/lib/metadata";

/** Index the landing and the public info pages; keep the app shells out. */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const base = await publicMetadataBase();
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/privacy",
          "/en/privacy",
          "/terms",
          "/en/terms",
          "/support",
          "/en/support",
          "/account/delete",
          "/en/account/delete",
        ],
        disallow: [
          "/api/",
          "/t/",
          "/platform/",
          "/profile/",
          "/home",
          "/organizations",
          "/share/",
          "/r/",
          "/pay/",
          "/d/",
          "/invite/",
          "/deposit-preauth/",
        ],
      },
    ],
    ...(base
      ? { sitemap: new URL("/sitemap.xml", base).href, host: base.origin }
      : {}),
  };
}

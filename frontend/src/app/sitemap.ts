import type { MetadataRoute } from "next";

import { routes } from "@/config/routes";
import { publicMetadataBase } from "@/features/legal/lib/metadata";

type Entry = {
  tr: string;
  en?: string;
  changeFrequency: "weekly" | "monthly" | "yearly";
  priority: number;
};

/** Public origin comes from the request host (no app URL at build time). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (await publicMetadataBase())?.origin ?? "";
  const lastModified = new Date();
  const p = routes.public;
  const entries: Entry[] = [
    { tr: p.root, changeFrequency: "weekly", priority: 1 },
    {
      tr: p.privacy,
      en: p.privacyEn,
      changeFrequency: "monthly",
      priority: 0.3,
    },
    { tr: p.terms, en: p.termsEn, changeFrequency: "monthly", priority: 0.3 },
    {
      tr: p.support,
      en: p.supportEn,
      changeFrequency: "monthly",
      priority: 0.4,
    },
    {
      tr: p.accountDelete,
      en: p.accountDeleteEn,
      changeFrequency: "yearly",
      priority: 0.2,
    },
  ];
  return entries.flatMap(({ tr, en, changeFrequency, priority }) => {
    const languages = en
      ? { languages: { tr: `${base}${tr}`, en: `${base}${en}` } }
      : undefined;
    const out: MetadataRoute.Sitemap = [
      {
        url: `${base}${tr}`,
        lastModified,
        changeFrequency,
        priority,
        alternates: languages,
      },
    ];
    if (en) {
      out.push({
        url: `${base}${en}`,
        lastModified,
        changeFrequency,
        priority,
        alternates: languages,
      });
    }
    return out;
  });
}

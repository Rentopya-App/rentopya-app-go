import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LogIn } from "lucide-react";

import { Button } from "@/components/ui/button";
import { upstreamConfig } from "@/config/api";
import { brand } from "@/config/brand";
import type { AppLocale } from "@/config/i18n";
import { routes } from "@/config/routes";
import {
  LegalDocument,
  type LegalDocumentData,
} from "@/features/legal/components/legal-document";
import {
  LEGAL_CONTACT_EMAIL,
  legalPath,
  type LegalSlug,
} from "@/features/legal/lib/legal";
import { publicMetadataBase } from "@/features/legal/lib/metadata";
import { translate } from "@/lib/i18n/messages";

/** Matches the API's Cache-Control max-age; admin edits show within a minute. */
const REVALIDATE_SECONDS = 60;

type PublicLegalPage = {
  slug: string;
  locale: AppLocale;
  title: string;
  markdown: string;
  updated_at: string;
};

type FetchResult =
  | { kind: "ok"; page: LegalDocumentData }
  | { kind: "not_found" }
  | { kind: "error" };

/** GET /v1/public/legal/{slug} from the server (no auth). */
async function fetchLegalPage(
  slug: string,
  locale: AppLocale,
): Promise<FetchResult> {
  try {
    const res = await fetch(
      `${upstreamConfig.baseUrl}/public/legal/${encodeURIComponent(slug)}?locale=${locale}`,
      {
        next: { revalidate: REVALIDATE_SECONDS, tags: [`legal:${slug}`] },
        signal: AbortSignal.timeout(4000),
      },
    );
    if (res.status === 404) return { kind: "not_found" };
    if (!res.ok) return { kind: "error" };
    const body = (await res.json()) as { data?: PublicLegalPage };
    if (!body.data) return { kind: "error" };
    return {
      kind: "ok",
      page: {
        title: body.data.title,
        markdown: body.data.markdown,
        updatedAt: body.data.updated_at,
        contentLocale: body.data.locale,
      },
    };
  } catch {
    return { kind: "error" };
  }
}

const t = (locale: AppLocale, key: string, params?: Record<string, string>) =>
  translate(locale, key, params, locale);

const PAGE_KEYS: Record<LegalSlug, { link: string; description: string }> = {
  privacy: {
    link: "legal.public.privacy_link",
    description: "legal.public.privacy_description",
  },
  terms: {
    link: "legal.public.terms_link",
    description: "legal.public.terms_description",
  },
  "account-deletion": {
    link: "legal.public.account_deletion_link",
    description: "legal.public.account_deletion_description",
  },
};

export async function legalMetadata(
  slug: LegalSlug,
  locale: AppLocale,
): Promise<Metadata> {
  const result = await fetchLegalPage(slug, locale);
  const title =
    result.kind === "ok" ? result.page.title : t(locale, PAGE_KEYS[slug].link);
  const description = t(locale, PAGE_KEYS[slug].description);
  const path = legalPath(slug, locale);
  return {
    metadataBase: await publicMetadataBase(),
    title,
    description,
    alternates: {
      canonical: path,
      languages: {
        tr: legalPath(slug, "tr"),
        en: legalPath(slug, "en"),
        "x-default": legalPath(slug, "tr"),
      },
    },
    openGraph: {
      type: "article",
      url: path,
      siteName: brand.productName,
      title,
      description,
      locale: locale === "en" ? "en_US" : "tr_TR",
    },
    robots: { index: true, follow: true },
  };
}

export async function LegalRoute({
  slug,
  locale,
}: {
  slug: LegalSlug;
  locale: AppLocale;
}) {
  const result = await fetchLegalPage(slug, locale);
  if (result.kind === "not_found") notFound();
  return (
    <LegalDocument
      slug={slug}
      locale={locale}
      page={result.kind === "ok" ? result.page : null}
      unavailable={{
        title: t(locale, "legal.public.unavailable_title"),
        body: t(locale, "legal.public.unavailable_body", {
          email: LEGAL_CONTACT_EMAIL,
        }),
      }}
      footer={
        slug === "account-deletion" ? (
          <div className="flex flex-col gap-4 rounded-lg border p-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-muted-foreground text-sm">
              {t(locale, "legal.public.account_deletion_sign_in_hint")}
            </p>
            <Button asChild className="shrink-0">
              <Link href={routes.guest.login}>
                <LogIn className="size-4" aria-hidden />
                {t(locale, "legal.public.account_deletion_sign_in")}
              </Link>
            </Button>
          </div>
        ) : null
      }
    />
  );
}

export {
  SupportPage,
  supportMetadata,
} from "@/features/legal/components/support-page";

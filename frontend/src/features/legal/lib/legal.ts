import type { AppLocale } from "@/config/i18n";
import { routes } from "@/config/routes";

/** Mirrors the backend cap (MaxMarkdownBytes) per locale. */
export const LEGAL_MAX_MARKDOWN_BYTES = 100 * 1024;

export const LEGAL_CONTACT_EMAIL = "contact@rentopya.app";

/** Operator named on the support page. */
export const LEGAL_COMPANY = "Technowide Software";

/** Legal pages with a public route and a platform editor (`legal_pages.slug`). */
export type LegalSlug = "privacy" | "terms" | "account-deletion";

const PATHS: Record<LegalSlug, Record<AppLocale, string>> = {
  privacy: { tr: routes.public.privacy, en: routes.public.privacyEn },
  terms: { tr: routes.public.terms, en: routes.public.termsEn },
  "account-deletion": {
    tr: routes.public.accountDelete,
    en: routes.public.accountDeleteEn,
  },
};

const encoder = new TextEncoder();

/** UTF-8 size, as the backend counts it. */
export function utf8Bytes(text: string): number {
  return encoder.encode(text).length;
}

/** Public URL of a legal page: Turkish at the root, English under `/en`. */
export function legalPath(slug: LegalSlug, locale: AppLocale): string {
  return PATHS[slug][locale];
}

/** Public URL of the support page in locale. */
export function supportPath(locale: AppLocale): string {
  return locale === "en" ? routes.public.supportEn : routes.public.support;
}

/** Date only, in Türkiye time so the shown day matches the admin's edit. */
export function formatLegalDate(iso: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Istanbul",
  }).format(new Date(iso));
}

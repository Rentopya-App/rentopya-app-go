import Link from "next/link";
import type { Metadata } from "next";
import { Mail } from "lucide-react";

import { brand } from "@/config/brand";
import type { AppLocale } from "@/config/i18n";
import {
  LEGAL_COMPANY,
  LEGAL_CONTACT_EMAIL,
  legalPath,
  supportPath,
} from "@/features/legal/lib/legal";
import { publicMetadataBase } from "@/features/legal/lib/metadata";
import { translate } from "@/lib/i18n/messages";

import { PublicPageShell } from "./public-page-shell";

const t = (locale: AppLocale, key: string) =>
  translate(locale, key, undefined, locale);

export async function supportMetadata(locale: AppLocale): Promise<Metadata> {
  const title = t(locale, "legal.support.title");
  const description = t(locale, "legal.support.description");
  const path = supportPath(locale);
  return {
    metadataBase: await publicMetadataBase(),
    title,
    description,
    alternates: {
      canonical: path,
      languages: {
        tr: supportPath("tr"),
        en: supportPath("en"),
        "x-default": supportPath("tr"),
      },
    },
    openGraph: {
      type: "website",
      url: path,
      siteName: brand.productName,
      title,
      description,
      locale: locale === "en" ? "en_US" : "tr_TR",
    },
    robots: { index: true, follow: true },
  };
}

type FaqItem = {
  q: string;
  a: string;
  link?: { href: string; label: string };
};

/** Public support page: contact details and short FAQ (App Store support URL). */
export function SupportPage({ locale }: { locale: AppLocale }) {
  const other: AppLocale = locale === "en" ? "tr" : "en";
  const faq: FaqItem[] = [
    { q: "faq_account_q", a: "faq_account_a" },
    { q: "faq_signin_q", a: "faq_signin_a" },
    { q: "faq_customer_q", a: "faq_customer_a" },
    {
      q: "faq_delete_q",
      a: "faq_delete_a",
      link: {
        href: legalPath("account-deletion", locale),
        label: "legal.public.account_deletion_link",
      },
    },
    {
      q: "faq_privacy_q",
      a: "faq_privacy_a",
      link: {
        href: legalPath("privacy", locale),
        label: "legal.public.privacy_link",
      },
    },
  ];

  return (
    <PublicPageShell locale={locale} switchHref={supportPath(other)}>
      <article className="mt-8">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {t(locale, "legal.support.title")}
        </h1>
        <p className="text-muted-foreground mt-4 text-base text-pretty">
          {t(locale, "legal.support.intro")}
        </p>

        <section className="mt-10 rounded-lg border p-6">
          <h2 className="text-lg font-semibold">
            {t(locale, "legal.support.contact_title")}
          </h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-[8rem_1fr]">
            <dt className="text-muted-foreground">
              {t(locale, "legal.support.contact_email_label")}
            </dt>
            <dd>
              <a
                href={`mailto:${LEGAL_CONTACT_EMAIL}`}
                className="text-primary inline-flex items-center gap-1.5 font-medium underline-offset-4 hover:underline"
              >
                <Mail className="size-4" aria-hidden />
                {LEGAL_CONTACT_EMAIL}
              </a>
            </dd>
            <dt className="text-muted-foreground">
              {t(locale, "legal.support.contact_company_label")}
            </dt>
            <dd>{LEGAL_COMPANY}</dd>
          </dl>
          <p className="text-muted-foreground mt-4 text-sm">
            {t(locale, "legal.support.contact_hours")}
          </p>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-semibold">
            {t(locale, "legal.support.faq_title")}
          </h2>
          <dl className="mt-6 space-y-6">
            {faq.map((item) => (
              <div key={item.q}>
                <dt className="font-medium">
                  {t(locale, `legal.support.${item.q}`)}
                </dt>
                <dd className="text-muted-foreground mt-1.5 text-sm">
                  {t(locale, `legal.support.${item.a}`)}
                  {item.link ? (
                    <>
                      {" "}
                      <Link
                        href={item.link.href}
                        className="text-primary font-medium underline-offset-4 hover:underline"
                      >
                        {t(locale, item.link.label)}
                      </Link>
                    </>
                  ) : null}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </article>
    </PublicPageShell>
  );
}

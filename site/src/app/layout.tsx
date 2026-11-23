import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import Script from "next/script";

import { SiteLocaleProvider } from "@/components/site/locale-context";

import { fontVariables } from "@/lib/fonts";
import { getCtx, mediaUrl } from "@/lib/server";
import { isLocale } from "@/lib/i18n";
import { PATH_HEADER } from "@/lib/request";
import { localizePath } from "@/lib/routes";
import { safeGa4Id, themeCss } from "@/lib/theme";
import { themeFor } from "@/themes";

import "./globals.css";

// Every request renders for its host: nothing is cached across hosts.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { site, locale } = await getCtx();
  const seo = site.config.seo?.[locale];
  const favicon = mediaUrl(site.assets.favicon) ?? mediaUrl(site.assets.logo);
  return {
    metadataBase: new URL(site.origin),
    title: {
      default: seo?.title || site.organization.name,
      template: `%s · ${site.organization.name}`,
    },
    description: seo?.description || undefined,
    openGraph: {
      siteName: site.organization.name,
      title: seo?.title || site.organization.name,
      description: seo?.description || undefined,
      locale: locale === "tr" ? "tr_TR" : "en_GB",
      type: "website",
    },
    icons: favicon ? { icon: favicon } : undefined,
    // Localized URLs (TEC-1285): this page's address in its language, and
    // the same page in every language the site offers. Pages with their own
    // canonical (articles, paginated guide) override it.
    alternates: await pageAlternates(site, locale),
    // A draft preview is never indexed.
    robots: site.preview ? { index: false, follow: false } : undefined,
  };
}

async function pageAlternates(
  site: Awaited<ReturnType<typeof getCtx>>["site"],
  locale: string,
): Promise<NonNullable<Metadata["alternates"]>> {
  const raw = (await headers()).get(PATH_HEADER) ?? "/";
  const path = raw.split("?")[0] || "/";
  const offered = site.locales.filter(isLocale);
  const fallback = isLocale(site.default_locale) ? site.default_locale : "tr";
  const languages: Record<string, string> = {};
  if (offered.length > 1) {
    for (const l of offered) languages[l] = localizePath(path, l);
    languages["x-default"] = localizePath(path, fallback);
  }
  return {
    canonical: localizePath(path, isLocale(locale) ? locale : fallback),
    languages,
  };
}

export async function generateViewport(): Promise<Viewport> {
  const { site } = await getCtx();
  return {
    themeColor: /^#[0-9a-f]{6}$/i.test(site.config.theme.colors.primary)
      ? site.config.theme.colors.primary
      : undefined,
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getCtx();
  const ga = safeGa4Id(ctx.site.config.analytics?.ga4_measurement_id);
  // The template renderer (src/themes); unknown templates render Technowide.
  const theme = themeFor(ctx.site);
  return (
    <html lang={ctx.locale} className={fontVariables}>
      <head>
        {/* Validated tokens only (lib/theme.ts). */}
        <style
          id="site-theme"
          dangerouslySetInnerHTML={{
            __html: themeCss(ctx.site.config.theme, theme.id),
          }}
        />
      </head>
      <body
        className={`${theme.className} ${ctx.embed ? "rt-body rt-body--embed" : "rt-body"}`}
        data-template={theme.id}
      >
        <SiteLocaleProvider locale={ctx.locale}>
          <a href="#main" className="rt-skip">
            {ctx.t("nav.skip")}
          </a>
          {ctx.site.preview ? (
            <div role="status" className="rt-preview-banner">
              <span>{ctx.t("preview.banner")}</span>
              <form action="/preview/exit" method="get">
                <button type="submit">{ctx.t("preview.exit")}</button>
              </form>
            </div>
          ) : null}
          {!ctx.embed ? <theme.Header ctx={ctx} /> : null}
          <main id="main" className="rt-main" tabIndex={-1}>
            {children}
          </main>
          {!ctx.embed ? <theme.Footer ctx={ctx} /> : null}
          {ga && !ctx.site.preview && !ctx.embed ? (
            <>
              <Script
                src={`https://www.googletagmanager.com/gtag/js?id=${ga}`}
                strategy="afterInteractive"
              />
              <Script id="ga4" strategy="afterInteractive">
                {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${ga}',{anonymize_ip:true});`}
              </Script>
            </>
          ) : null}
        </SiteLocaleProvider>
      </body>
    </html>
  );
}

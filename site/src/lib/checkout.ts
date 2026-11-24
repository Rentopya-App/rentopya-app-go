import "server-only";

import { apiFetch } from "./api";
import { payLinkToken, returnURL, safeCheckoutURL } from "./payment-return";
import { getCtx, getForwardedFor } from "./server";

/**
 * Starts the provider's hosted checkout for a pay link from this site and
 * returns the provider's page: the customer goes from the site straight to
 * the provider (iyzico) and comes back to `/payment/{token}/return` here,
 * never through the platform's pay page. Null when that is not possible (a
 * preview, an older link, the API refusing): the caller then falls back to
 * the hosted pay page, so a customer can always pay.
 */
export async function siteCheckout(
  linkUrl: string,
  to: string,
  embed?: string,
): Promise<string | null> {
  const { site, locale } = await getCtx();
  if (site.preview) return null;
  const token = payLinkToken(linkUrl);
  if (!token) return null;
  let back: string | null;
  try {
    back = returnURL({ origin: site.origin, token, to, embed });
  } catch {
    return null; // SITE_EMBED_SECRET missing
  }
  if (!back) return null;
  try {
    const out = await apiFetch<{ payment_page_url: string }>(
      `/v1/public/pay/${encodeURIComponent(token)}/checkout`,
      {
        method: "POST",
        body: { locale, return_url: back },
        forwardedFor: await getForwardedFor(),
      },
    );
    return safeCheckoutURL(out?.payment_page_url);
  } catch {
    return null;
  }
}

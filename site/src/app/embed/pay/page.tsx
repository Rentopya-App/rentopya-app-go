import { notFound } from "next/navigation";

import { PageHeading, PageSection } from "@/components/site/page-heading";
import { buttonVariants } from "@/components/ui/button";
import { openEmbed } from "@/lib/embed";
import { embedContext } from "@/lib/embed-server";
import { paymentHandoff } from "@/lib/payment-handoff";
import { payLinkToken, safeCheckoutURL } from "@/lib/payment-return";
import { getCtx } from "@/lib/server";

export default async function EmbedPayPage() {
  const ctx = await getCtx();
  const { site, t } = ctx;
  const embed = await embedContext();
  const state = openEmbed(embed?.fields.s || null, site.origin);
  if (!state?.payment || !state.reservation) notFound();
  const checked = safeCheckoutURL(state.payment);
  if (!checked) notFound();
  const payment = new URL(checked);
  const token = payLinkToken(checked);
  if (token) {
    // Fallback: the hosted pay page, which returns to this site with a
    // signed hand-off. The return reference is encrypted and can only be
    // read on this site's origin.
    const back = new URL(
      `/reservation/${encodeURIComponent(state.reservation.reference)}`,
      site.origin,
    );
    back.searchParams.set("s", embed!.fields.s);
    payment.pathname += "/widget";
    payment.search = "";
    payment.searchParams.set(
      "handoff",
      paymentHandoff({
        token,
        url: back.toString(),
        organization: site.organization.uuid,
        expires: state.expires,
      }),
    );
  }
  // Otherwise the provider's own page, started by this site: it returns to
  // /payment/{token}/return here.
  return (
    <>
      <PageHeading ctx={ctx} title={t("res.pay")} />
      <PageSection>
        <div className="rt-stack">
          <p>{t("widget.payment_outside")}</p>
          <a
            data-widget-payment
            href={payment.toString()}
            target="_top"
            rel="noreferrer"
            className={buttonVariants()}
          >
            {t("res.pay")}
          </a>
          <a
            href={payment.toString()}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "outline" })}
          >
            {t("widget.new_tab")}
          </a>
        </div>
      </PageSection>
    </>
  );
}

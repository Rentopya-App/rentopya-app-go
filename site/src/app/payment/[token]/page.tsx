import { CreditCard } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeading, PageSection } from "@/components/site/page-heading";
import { PaymentRefresh } from "@/components/site/payment-refresh";
import { Button } from "@/components/ui/button";
import { Alert, Card } from "@/components/ui/card";
import { ApiError, apiFetch } from "@/lib/api";
import { dateTime, money } from "@/lib/format";
import { getCtx, getForwardedFor } from "@/lib/server";

import { payLink } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getCtx();
  return {
    title: t("paylink.title"),
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

type PublicLink = {
  organization_name: string;
  organization_uuid: string;
  reference: string;
  product_title: string;
  starts_at: string;
  ends_at: string;
  amount: string;
  currency: string;
  expires_at: string;
  state: string;
  result: string;
};

const TOKEN = /^[A-Za-z0-9_-]{20,64}$/;

/**
 * A pay link staff sent (SMS, WhatsApp) on the organization's own site
 * (TEC-1297): the summary, then straight to the provider and back here.
 * Only what the API verified with the provider is shown as paid.
 */
export default async function PayLinkPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ payment?: string; error?: string }>;
}) {
  const ctx = await getCtx();
  const { t, locale } = ctx;
  const { token } = await params;
  if (!TOKEN.test(token)) notFound();
  const sp = await searchParams;
  const returned = sp.payment === token;
  let link: PublicLink;
  try {
    link = await apiFetch<PublicLink>(
      `/v1/public/pay/${encodeURIComponent(token)}${returned ? "?verify=1" : ""}`,
      { forwardedFor: await getForwardedFor() },
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  // The link must belong to this site's organization.
  if (link.organization_uuid !== ctx.site.organization.uuid) notFound();

  const pending =
    link.state === "processing" || (returned && link.state === "ready");
  let status: React.ReactNode = null;
  if (link.state === "paid") {
    status = (
      <Alert tone="success">
        {t(
          link.result === "late_payment_task"
            ? "res.pay_result.late"
            : "res.pay_result.paid",
        )}
      </Alert>
    );
  } else if (pending) {
    status = (
      <Alert>
        <PaymentRefresh
          waiting={t("res.pay_result.processing")}
          slow={t("res.pay_result.slow")}
        />
      </Alert>
    );
  } else if (link.state === "failed") {
    status = <Alert tone="error">{t("res.pay_result.failed")}</Alert>;
  } else if (link.state === "expired") {
    status = <Alert tone="error">{t("paylink.expired")}</Alert>;
  } else if (link.state === "cancelled") {
    status = <Alert tone="error">{t("paylink.cancelled")}</Alert>;
  }
  const payable =
    !pending && (link.state === "ready" || link.state === "failed");

  return (
    <>
      <PageHeading ctx={ctx} title={t("paylink.title")} />
      <PageSection narrow>
        <div className="rt-stack">
          {sp.error === "checkout" ? (
            <Alert tone="error">{t("paylink.checkout_failed")}</Alert>
          ) : null}
          {status}
          <Card className="rt-panel">
            <dl className="rt-summary-rows">
              <div>
                <dt>{t("paylink.reference")}</dt>
                <dd className="rt-num">{link.reference}</dd>
              </div>
              <div>
                <dt>{t("paylink.vehicle")}</dt>
                <dd>{link.product_title}</dd>
              </div>
              <div>
                <dt>{t("paylink.dates")}</dt>
                <dd>
                  {dateTime(link.starts_at, locale)} →{" "}
                  {dateTime(link.ends_at, locale)}
                </dd>
              </div>
              <div>
                <dt>{t("paylink.amount")}</dt>
                <dd className="rt-num rt-strong">
                  {money(link.amount, link.currency, locale)}
                </dd>
              </div>
            </dl>
            {payable ? (
              <form action={payLink} className="rt-stack">
                <input type="hidden" name="token" value={token} />
                <Button type="submit" size="lg" className="rt-submit-full">
                  <CreditCard size={18} aria-hidden />
                  {t("res.pay")} · {money(link.amount, link.currency, locale)}
                </Button>
                <p className="rt-muted">{t("res.pay_secure_note")}</p>
                <p className="rt-muted">
                  {t("paylink.valid_until", {
                    date: dateTime(link.expires_at, locale),
                  })}
                </p>
              </form>
            ) : null}
          </Card>
        </div>
      </PageSection>
    </>
  );
}

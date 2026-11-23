import { CalendarDays, MapPin } from "lucide-react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { signOut } from "@/app/customer-actions";
import {
  EmptyState,
  PageHeading,
  PageSection,
} from "@/components/site/page-heading";
import Link from "@/components/site/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge, Card, CardTitle } from "@/components/ui/card";
import { ApiError } from "@/lib/api";
import { currentCustomer, customerApi } from "@/lib/customer";
import type { CustomerReservationSummary } from "@/lib/customer-types";
import { dateTime, money } from "@/lib/format";
import { getCtx } from "@/lib/server";
import { statusLabel } from "@/components/site/account";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getCtx();
  return { title: t("acc.title"), robots: { index: false } };
}

/**
 * The signed-in customer's reservations in this organization (TEC-1284):
 * /account and /hesabim. A visitor without a session signs in first.
 */
export default async function AccountPage() {
  const ctx = await getCtx();
  const { t, locale } = ctx;
  if (ctx.embed) notFound();
  const me = await currentCustomer();
  if (!me) redirect(ctx.href("/login?next=/account"));

  let rows: CustomerReservationSummary[];
  try {
    const out = await customerApi<{ items: CustomerReservationSummary[] }>(
      "/reservations",
    );
    rows = out.items ?? [];
  } catch (err) {
    if (err instanceof ApiError && err.status === 401)
      redirect(ctx.href("/login?next=/account&error=session"));
    throw err;
  }

  return (
    <>
      <PageHeading
        ctx={ctx}
        title={t("acc.title")}
        lead={t("acc.signed_in_as", { contact: me.contact_masked })}
      />
      <PageSection>
        <div className="rt-stack">
          <div className="rt-res-head">
            <CardTitle>{t("acc.hello", { name: me.display_name })}</CardTitle>
            <form action={signOut}>
              <Button type="submit" variant="outline" size="sm">
                {t("acc.sign_out")}
              </Button>
            </form>
          </div>
          <h2 className="rt-section-title">{t("acc.reservations")}</h2>
          {rows.length === 0 ? (
            <EmptyState
              title={t("acc.empty_title")}
              text={t("acc.empty_text")}
              action={
                ctx.site.booking_enabled ? (
                  <Link href="/vehicles" className={buttonVariants()}>
                    {t("acc.book")}
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <ul className="rt-account-list">
              {rows.map((r) => (
                <li key={r.uuid}>
                  <Card className="rt-panel">
                    <div className="rt-res-head">
                      <CardTitle>
                        <span className="font-mono">{r.reference}</span>
                        {r.product ? ` · ${r.product}` : null}
                      </CardTitle>
                      <Badge>{statusLabel(ctx, r.status)}</Badge>
                    </div>
                    <dl className="rt-details">
                      <div>
                        <dt>
                          <CalendarDays aria-hidden size={15} />{" "}
                          {t("acc.pickup")}
                        </dt>
                        <dd>
                          {dateTime(r.starts_at, locale)}
                          <br />
                          <MapPin aria-hidden size={13} /> {r.pickup_branch}
                        </dd>
                      </div>
                      <div>
                        <dt>
                          <CalendarDays aria-hidden size={15} />{" "}
                          {t("acc.return")}
                        </dt>
                        <dd>
                          {dateTime(r.ends_at, locale)}
                          <br />
                          <MapPin aria-hidden size={13} /> {r.return_branch}
                        </dd>
                      </div>
                      <div>
                        <dt>{t("acc.total")}</dt>
                        <dd>
                          {money(r.price.total, r.price.currency, locale)}
                          {Number(r.price.balance) > 0 ? (
                            <>
                              <br />
                              {t("acc.balance")}:{" "}
                              {money(r.price.balance, r.price.currency, locale)}
                            </>
                          ) : null}
                        </dd>
                      </div>
                    </dl>
                    <Link
                      href={`/account/${r.uuid}`}
                      className={buttonVariants({ variant: "outline" })}
                    >
                      {t("acc.view")}
                    </Link>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PageSection>
    </>
  );
}

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { createRequest, payReservation } from "@/app/customer-actions";
import { documentLabel, statusLabel } from "@/components/site/account";
import Link from "@/components/site/link";
import { PageHeading, PageSection } from "@/components/site/page-heading";
import { Paragraphs } from "@/components/site/text";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert, Badge, Card, CardTitle } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/form";
import { ApiError } from "@/lib/api";
import { currentCustomer, customerApi } from "@/lib/customer";
import type { CustomerReservation } from "@/lib/customer-types";
import { dateTime, istanbulDate, money } from "@/lib/format";
import { getCtx, type Ctx } from "@/lib/server";
import type { MessageKey } from "@/messages/tr";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getCtx();
  return { title: t("res.title"), robots: { index: false } };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ERRORS = ["invalid", "limited", "failed", "pay"];

function RequestForm({
  ctx,
  r,
  type,
  error,
}: {
  ctx: Ctx;
  r: CustomerReservation;
  type: "change" | "cancel";
  error: string | null;
}) {
  const { t, locale } = ctx;
  const cur = r.price.currency;
  return (
    <Card className="rt-panel" id={type === "change" ? "request" : undefined}>
      <CardTitle>
        {t(
          type === "change"
            ? "acc.request.new_change"
            : "acc.request.new_cancel",
        )}
      </CardTitle>
      {type === "cancel" && r.cancellation.policy_text ? (
        <div className="rt-stack">
          <strong>{t("acc.request.policy")}</strong>
          <Paragraphs text={r.cancellation.policy_text} />
        </div>
      ) : null}
      {type === "cancel" && r.cancellation.fee ? (
        <p>
          {t("acc.request.fee", {
            amount: money(r.cancellation.fee, cur, locale),
          })}
        </p>
      ) : null}
      {type === "cancel" && r.cancellation.self_cancel ? (
        <Alert>{t("acc.request.self_cancel")}</Alert>
      ) : null}
      <form action={createRequest} className="rt-stack">
        <input type="hidden" name="reservation" value={r.uuid} />
        <input type="hidden" name="type" value={type} />
        {error ? <Alert tone="error">{error}</Alert> : null}
        <Field
          id={`${type}-message`}
          label={t("acc.request.message")}
          hint={type === "change" ? t("acc.request.message_hint") : undefined}
        >
          <Textarea
            name="message"
            rows={3}
            maxLength={2000}
            required={type === "change"}
          />
        </Field>
        {type === "change" ? (
          <fieldset className="rt-stack">
            <legend>{t("acc.request.new_dates")}</legend>
            <div className="rt-details">
              <Field
                id="start_date"
                label={`${t("acc.request.start")} · ${t("acc.request.date")}`}
              >
                <Input type="date" name="start_date" min={istanbulDate()} />
              </Field>
              <Field
                id="start_time"
                label={`${t("acc.request.start")} · ${t("acc.request.time")}`}
              >
                <Input type="time" name="start_time" step={900} />
              </Field>
              <Field
                id="end_date"
                label={`${t("acc.request.end")} · ${t("acc.request.date")}`}
              >
                <Input type="date" name="end_date" min={istanbulDate()} />
              </Field>
              <Field
                id="end_time"
                label={`${t("acc.request.end")} · ${t("acc.request.time")}`}
              >
                <Input type="time" name="end_time" step={900} />
              </Field>
            </div>
          </fieldset>
        ) : null}
        <Button
          type="submit"
          variant={type === "cancel" ? "outline" : "default"}
        >
          {t("acc.request.send")}
        </Button>
      </form>
    </Card>
  );
}

/**
 * One reservation of the signed-in customer (TEC-1284): details, payment,
 * documents, invoices and change / cancellation requests.
 */
export default async function AccountReservationPage({
  params,
  searchParams,
}: {
  params: Promise<{ uuid: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await getCtx();
  const { t, locale } = ctx;
  if (ctx.embed) notFound();
  const { uuid } = await params;
  if (!UUID.test(uuid)) notFound();
  const here = `/account/${uuid}`;
  if (!(await currentCustomer()))
    redirect(ctx.href(`/login?next=${encodeURIComponent(here)}`));
  const sp = await searchParams;

  let r: CustomerReservation;
  try {
    r = await customerApi<CustomerReservation>(`/reservations/${uuid}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    if (err instanceof ApiError && err.status === 401)
      redirect(
        ctx.href(`/login?next=${encodeURIComponent(here)}&error=session`),
      );
    throw err;
  }
  const cur = r.price.currency;
  const error =
    sp.error && ERRORS.includes(sp.error)
      ? t(`acc.error.${sp.error}` as MessageKey)
      : null;
  const formError =
    sp.form === "change" || sp.form === "cancel" ? sp.form : null;

  return (
    <>
      <PageHeading
        ctx={ctx}
        title={r.reference}
        trail={[{ href: "/account", label: t("acc.title") }]}
      />
      <PageSection>
        <div className="rt-stack">
          {sp.request === "change" ? (
            <Alert tone="success">{t("acc.request.sent_change")}</Alert>
          ) : null}
          {sp.request === "cancel" ? (
            <Alert tone="success">{t("acc.request.sent_cancel")}</Alert>
          ) : null}
          {error && !formError ? <Alert tone="error">{error}</Alert> : null}

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
                <dt>{t("acc.pickup")}</dt>
                <dd>
                  {r.pickup_point
                    ? `${r.pickup_branch} — ${r.pickup_point}`
                    : r.pickup_branch}
                  <br />
                  {dateTime(r.starts_at, locale)}
                </dd>
              </div>
              <div>
                <dt>{t("acc.return")}</dt>
                <dd>
                  {r.return_point
                    ? `${r.return_branch} — ${r.return_point}`
                    : r.return_branch}
                  <br />
                  {dateTime(r.ends_at, locale)}
                </dd>
              </div>
              {r.vehicle ? (
                <div>
                  <dt>{t("acc.vehicle")}</dt>
                  <dd>{r.vehicle}</dd>
                </div>
              ) : null}
              {r.drivers.length ? (
                <div>
                  <dt>{t("acc.drivers")}</dt>
                  <dd>{r.drivers.join(", ")}</dd>
                </div>
              ) : null}
              {r.extras.length ? (
                <div>
                  <dt>{t("acc.extras")}</dt>
                  <dd>
                    {r.extras
                      .map((e) => `${e.name} × ${e.quantity}`)
                      .join(", ")}
                  </dd>
                </div>
              ) : null}
              <div>
                <dt>{t("acc.total")}</dt>
                <dd>
                  {money(r.price.total, cur, locale)}
                  {Number(r.price.balance) > 0 ? (
                    <>
                      <br />
                      {t("acc.balance")}: {money(r.price.balance, cur, locale)}
                    </>
                  ) : null}
                </dd>
              </div>
              {r.payment_deadline ? (
                <div>
                  <dt>{t("acc.payment_deadline")}</dt>
                  <dd>{dateTime(r.payment_deadline, locale)}</dd>
                </div>
              ) : null}
            </dl>
            {r.actions.pay && r.actions.pay_amount ? (
              <form action={payReservation}>
                <input type="hidden" name="reservation" value={r.uuid} />
                <Button type="submit" size="lg">
                  {t("acc.pay", {
                    amount: money(r.actions.pay_amount, cur, locale),
                  })}
                </Button>
              </form>
            ) : null}
          </Card>

          <Card className="rt-panel">
            <CardTitle>{t("acc.documents")}</CardTitle>
            {r.documents.length === 0 && r.invoices.length === 0 ? (
              <p>{t("acc.no_documents")}</p>
            ) : (
              <ul className="rt-doc-list">
                {r.documents.map((d) => (
                  <li key={d.uuid}>
                    <span>{documentLabel(ctx, d.kind)}</span>
                    <span className="rt-actions">
                      {d.approval_url ? (
                        <a
                          href={d.approval_url}
                          className={buttonVariants({ size: "sm" })}
                        >
                          {t("acc.approve")}
                        </a>
                      ) : null}
                      {d.pdf_available ? (
                        <a
                          href={ctx.href(
                            `/account/${r.uuid}/documents/${d.uuid}`,
                          )}
                          className={buttonVariants({
                            variant: "outline",
                            size: "sm",
                          })}
                          target="_blank"
                          rel="noopener"
                        >
                          {t("acc.download")}
                        </a>
                      ) : null}
                    </span>
                  </li>
                ))}
                {r.invoices.map((i) => (
                  <li key={i.uuid}>
                    <span>
                      {t("acc.invoices")}:{" "}
                      <span className="font-mono">{i.number}</span> ·{" "}
                      {money(i.payable_amount, i.currency || cur, locale)}
                    </span>
                    <a
                      href={ctx.href(`/account/${r.uuid}/invoices/${i.uuid}`)}
                      className={buttonVariants({
                        variant: "outline",
                        size: "sm",
                      })}
                      target="_blank"
                      rel="noopener"
                    >
                      {t("acc.download")}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {r.requests.length ? (
            <Card className="rt-panel" id="requests">
              <CardTitle>{t("acc.requests")}</CardTitle>
              <ul className="rt-doc-list">
                {r.requests.map((q) => (
                  <li key={q.uuid}>
                    <span>
                      {t(
                        q.type === "cancel"
                          ? "acc.request.cancel"
                          : "acc.request.change",
                      )}{" "}
                      · {dateTime(q.created_at, locale)}
                      {q.resolution_note ? (
                        <>
                          <br />
                          {q.resolution_note}
                        </>
                      ) : null}
                    </span>
                    <Badge>
                      {t(`acc.request.status.${q.status}` as MessageKey)}
                    </Badge>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {r.actions.request_change ? (
            <RequestForm
              ctx={ctx}
              r={r}
              type="change"
              error={formError === "change" ? error : null}
            />
          ) : null}
          {r.actions.request_cancel ? (
            <RequestForm
              ctx={ctx}
              r={r}
              type="cancel"
              error={formError === "cancel" ? error : null}
            />
          ) : null}

          <Link
            href="/account"
            className={buttonVariants({ variant: "ghost" })}
          >
            ← {t("acc.back")}
          </Link>
        </div>
      </PageSection>
    </>
  );
}

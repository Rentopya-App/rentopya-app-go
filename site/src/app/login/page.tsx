import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import {
  changeContact,
  resendCode,
  startSignIn,
  verifySignIn,
} from "@/app/customer-actions";
import { PageHeading, PageSection } from "@/components/site/page-heading";
import Link from "@/components/site/link";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { PENDING_COOKIE, currentCustomer, portalInfo } from "@/lib/customer";
import { accountNext, maskContact, openPending } from "@/lib/customer-seal";
import { deviceReservations } from "@/lib/reservation-tokens";
import { getCtx } from "@/lib/server";
import type { MessageKey } from "@/messages/tr";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getCtx();
  return { title: t("acc.login.title"), robots: { index: false } };
}

const ERRORS = [
  "invalid",
  "code",
  "limited",
  "unavailable",
  "expired",
  "wait",
  "session",
  "failed",
];

/**
 * Customer sign-in on the site itself (TEC-1284): the phone number or e-mail
 * address on a reservation, then the one-time code. Same host, same theme;
 * works without JavaScript. /login and /giris (TEC-1285).
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await getCtx();
  const { t, site } = ctx;
  if (ctx.embed) notFound();
  const sp = await searchParams;
  const next = accountNext(sp.next);
  if (await currentCustomer()) redirect(ctx.href(next));

  const error =
    sp.error && ERRORS.includes(sp.error)
      ? t(`acc.error.${sp.error}` as MessageKey)
      : null;
  const info = site.preview ? null : await portalInfo();
  const pending = openPending(
    (await cookies()).get(PENDING_COOKIE)?.value,
    site.origin,
  );
  const codeStep = sp.step === "code" && pending;
  const mine = await deviceReservations(site);

  const body = site.preview ? (
    <Alert>{t("acc.login.preview")}</Alert>
  ) : !info || (!info.channels.sms && !info.channels.email) ? (
    <Card className="rt-panel">
      <CardTitle>{t("acc.login.unavailable_title")}</CardTitle>
      <p className="rt-lead">{t("acc.login.unavailable")}</p>
    </Card>
  ) : codeStep ? (
    <Card className="rt-panel">
      <CardTitle>{t("acc.login.code_title")}</CardTitle>
      <p className="rt-lead">
        {t(
          pending.channel === "email"
            ? "acc.login.code_lead_email"
            : "acc.login.code_lead_sms",
          { contact: maskContact(pending.contact) },
        )}
      </p>
      <form action={verifySignIn} className="rt-stack">
        <Field id="code" label={t("acc.login.code")} error={error ?? undefined}>
          <Input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]{6,8}"
            className="rt-otp"
            maxLength={8}
            required
            autoFocus
          />
        </Field>
        <Button type="submit" size="lg">
          {t("acc.login.verify")}
        </Button>
      </form>
      <div className="rt-actions">
        <form action={resendCode}>
          <Button type="submit" variant="outline">
            {t("acc.login.resend")}
          </Button>
        </form>
        <form action={changeContact}>
          <Button type="submit" variant="ghost">
            {t("acc.login.change")}
          </Button>
        </form>
      </div>
    </Card>
  ) : (
    <Card className="rt-panel">
      <CardTitle>{t("acc.login.title")}</CardTitle>
      <p className="rt-lead">{t("acc.login.lead")}</p>
      <form action={startSignIn} className="rt-stack">
        <input type="hidden" name="next" value={next} />
        <Field
          id="contact"
          label={t("acc.login.contact")}
          hint={t("acc.login.contact_hint")}
          error={error ?? undefined}
        >
          <Input
            name="contact"
            autoComplete="username"
            placeholder={t("acc.login.contact_placeholder")}
            maxLength={254}
            required
            autoFocus
          />
        </Field>
        <Button type="submit" size="lg">
          {t("acc.login.send")}
        </Button>
      </form>
    </Card>
  );

  return (
    <>
      <PageHeading ctx={ctx} title={t("acc.login.title")} />
      <PageSection narrow>
        <div className="rt-stack">
          {sp.signed_out ? (
            <Alert tone="success">{t("acc.login.signed_out")}</Alert>
          ) : null}
          {sp.sent ? (
            <Alert tone="success">{t("acc.login.sent_again")}</Alert>
          ) : null}
          {error &&
          !codeStep &&
          (sp.error === "expired" || sp.error === "session") ? (
            <Alert tone="error">{error}</Alert>
          ) : null}
          {body}
          {mine.length ? (
            <Card className="rt-panel">
              <CardTitle>{t("acc.login.device")}</CardTitle>
              <ul className="rt-ref-list">
                {mine.map((ref) => (
                  <li key={ref}>
                    <Link
                      href={`/reservation/${encodeURIComponent(ref)}`}
                      className="font-mono"
                    >
                      {ref}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </PageSection>
    </>
  );
}

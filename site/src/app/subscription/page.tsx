import { MailCheck } from "lucide-react";
import type { Metadata } from "next";

import { PageHeading, PageSection } from "@/components/site/page-heading";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { getCtx } from "@/lib/server";
import type { MessageKey } from "@/messages/tr";

import { confirmSubscription, unsubscribe } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getCtx();
  return { title: t("sub.title"), robots: { index: false, follow: false } };
}

const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const RESULTS = ["confirmed", "unsubscribed", "invalid", "busy"];

/** The e-mail links of the newsletter / marketing double opt-in (TEC-1287). */
export default async function SubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await getCtx();
  const { t } = ctx;
  const sp = await searchParams;
  const confirm = TOKEN.test(sp.confirm ?? "") ? sp.confirm : null;
  const leave = TOKEN.test(sp.unsubscribe ?? "") ? sp.unsubscribe : null;
  const result = RESULTS.includes(sp.result ?? "") ? sp.result : null;

  let body: React.ReactNode;
  if (result) {
    body = (
      <Alert
        tone={result === "invalid" || result === "busy" ? "error" : "success"}
      >
        {t(`sub.result.${result}` as MessageKey)}
      </Alert>
    );
  } else if (confirm) {
    body = (
      <form action={confirmSubscription} className="rt-stack">
        <p className="rt-lead">
          {t("sub.confirm_intro", { site: ctx.site.organization.name })}
        </p>
        <input type="hidden" name="token" value={confirm} />
        <Button type="submit" size="lg">
          {t("sub.confirm_button")}
        </Button>
      </form>
    );
  } else if (leave) {
    body = (
      <form action={unsubscribe} className="rt-stack">
        <p className="rt-lead">
          {t("sub.unsubscribe_intro", { site: ctx.site.organization.name })}
        </p>
        <input type="hidden" name="token" value={leave} />
        <Button type="submit" size="lg" variant="outline">
          {t("sub.unsubscribe_button")}
        </Button>
      </form>
    );
  } else {
    body = <Alert tone="error">{t("sub.result.invalid")}</Alert>;
  }

  return (
    <>
      <PageHeading ctx={ctx} title={t("sub.title")} />
      <PageSection narrow>
        <div className="rt-lookup">
          <span className="rt-page-icon" aria-hidden>
            <MailCheck size={26} />
          </span>
          {body}
        </div>
      </PageSection>
    </>
  );
}

import { Ticket } from "lucide-react";
import type { Metadata } from "next";
import Link from "@/components/site/link";

import { PageHeading, PageSection } from "@/components/site/page-heading";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { hasCustomerCookie } from "@/lib/customer";
import { deviceReservations } from "@/lib/reservation-tokens";
import { getCtx } from "@/lib/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getCtx();
  return { title: t("lookup.title") };
}

/**
 * Reservation lookup: sign-in to the customer area on this site
 * (TEC-1284), plus this device's bookings.
 */
export default async function LookupPage() {
  const ctx = await getCtx();
  const { t, site } = ctx;
  const mine = await deviceReservations(site);
  return (
    <>
      <PageHeading ctx={ctx} title={t("lookup.title")} />
      <PageSection narrow>
        <div className="rt-lookup">
          <span className="rt-page-icon" aria-hidden>
            <Ticket size={26} />
          </span>
          <p className="rt-lead">{t("lookup.intro")}</p>
          {!site.preview ? (
            <Link
              href={(await hasCustomerCookie()) ? "/account" : "/login"}
              className={buttonVariants({ size: "lg" })}
            >
              {t("lookup.go")}
            </Link>
          ) : null}
          {mine.length ? (
            <Card className="rt-panel">
              <CardTitle>{t("lookup.device")}</CardTitle>
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

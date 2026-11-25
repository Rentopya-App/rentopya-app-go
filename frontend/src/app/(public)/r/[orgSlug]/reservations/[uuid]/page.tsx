import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { Loading } from "@/components/common/loading";
import { PortalReservationPage } from "@/features/customer-portal";
import { portalSite, siteAccountPath } from "@/lib/portal-site";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function Page({
  params,
}: {
  params: Promise<{ orgSlug: string; uuid: string }>;
}) {
  const { orgSlug, uuid } = await params;
  // The customer area lives on the organization's live site (TEC-1284).
  const site = await portalSite(orgSlug);
  if (site && /^[0-9a-f-]{36}$/i.test(uuid))
    redirect(`${site.url}${siteAccountPath(site.locale, uuid)}`);
  return (
    <Suspense fallback={<Loading />}>
      <PortalReservationPage orgSlug={orgSlug} uuid={uuid} />
    </Suspense>
  );
}

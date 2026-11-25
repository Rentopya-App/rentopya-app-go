import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { Loading } from "@/components/common/loading";
import { PortalHome } from "@/features/customer-portal";
import { portalSite, siteAccountPath } from "@/lib/portal-site";

// Customer portal (TEC-715): personal data behind a customer session; keep
// it out of indexes and referrers.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function Page({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  // The customer area lives on the organization's live site (TEC-1284).
  const site = await portalSite(orgSlug);
  if (site) redirect(`${site.url}${siteAccountPath(site.locale)}`);
  return (
    <Suspense fallback={<Loading />}>
      <PortalHome orgSlug={orgSlug} />
    </Suspense>
  );
}

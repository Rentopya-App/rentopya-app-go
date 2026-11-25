import type {
  ListSiteLeadsParams,
  SiteLead,
  SiteLeadPage,
  SiteLeadPatch,
  SiteLeadSettings,
} from "@/features/site-leads/types";
import { tenantRequest } from "@/lib/api/tenant-request";

const LEADS = "/v1/tenant/site/leads";

/** Website enquiries of one organization (`tenantRequest` only). */
export const siteLeadsService = {
  list(slug: string, params: ListSiteLeadsParams) {
    return tenantRequest<SiteLeadPage>(slug, "GET", LEADS, { query: params });
  },
  get(slug: string, uuid: string) {
    return tenantRequest<SiteLead>(
      slug,
      "GET",
      `${LEADS}/${encodeURIComponent(uuid)}`,
    );
  },
  update(slug: string, uuid: string, body: SiteLeadPatch) {
    return tenantRequest<SiteLead>(
      slug,
      "PATCH",
      `${LEADS}/${encodeURIComponent(uuid)}`,
      { body },
    );
  },
  /** Retention period of the organization's leads (TEC-1287). */
  settings(slug: string) {
    return tenantRequest<SiteLeadSettings>(slug, "GET", `${LEADS}/settings`);
  },
  saveSettings(slug: string, body: SiteLeadSettings) {
    return tenantRequest<SiteLeadSettings>(slug, "PUT", `${LEADS}/settings`, {
      body,
    });
  },
};

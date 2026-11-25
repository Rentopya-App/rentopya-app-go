import type { components } from "@/generated/api";

type Schemas = components["schemas"];

/** A website enquiry or newsletter subscription (TEC-786). */
export type SiteLead = Schemas["SiteLead"];
export type SiteLeadPage = Schemas["EnvelopeSiteLeads"]["data"];
export type SiteLeadPatch = Schemas["SiteLeadPatch"];
export type SiteLeadKind = SiteLead["kind"];
export type SiteLeadStatus = SiteLead["status"];
/** TEC-1287 double opt-in: only confirmed is marketing permission. */
export type SiteLeadMarketingStatus = SiteLead["marketing_status"];
export type SiteLeadSettings = Schemas["SiteLeadSettings"];

/** List query of `GET /v1/tenant/site/leads`. */
export type ListSiteLeadsParams = {
  limit: number;
  offset: number;
  sort?: string;
  q?: string;
  kind?: string;
  status?: string;
  /** RFC 3339, inclusive. */
  date_from?: string;
  /** RFC 3339, exclusive. */
  date_to?: string;
};

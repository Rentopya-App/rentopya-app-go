/**
 * Pure helpers of the configuration screens (pricing, fleet set-up,
 * branches, channels): the panel paths, labels and the validation of the
 * small edits the app offers, with the same rules as the panel's zod
 * schemas. Errors are i18n keys of the shared panel catalogs.
 * Free of app imports so it runs under `node --test`.
 */
import { Permission, type PermissionSlug } from '../../core/auth/permission-slugs.ts';

export type Errors = Record<string, string>;

/** Configuration areas of the hub, each behind the permission of its panel page. */
export const SECTIONS = [
  { key: 'rate_plans', perm: Permission.TenantPricingRead, icon: 'wallet', group: 'pricing' },
  { key: 'matrix', perm: Permission.TenantPricingRead, icon: 'gauge', group: 'pricing' },
  { key: 'date_rules', perm: Permission.TenantPricingRead, icon: 'calendar', group: 'pricing' },
  { key: 'extras', perm: Permission.TenantExtrasRead, icon: 'add', group: 'pricing' },
  { key: 'campaigns', perm: Permission.TenantCampaignsRead, icon: 'card', group: 'pricing' },
  { key: 'preview', perm: Permission.TenantPricingRead, icon: 'search', group: 'pricing' },
  { key: 'segments', perm: Permission.TenantFleetRead, icon: 'car', group: 'fleet' },
  { key: 'groups', perm: Permission.TenantFleetRead, icon: 'car', group: 'fleet' },
  { key: 'products', perm: Permission.TenantFleetRead, icon: 'document', group: 'fleet' },
  { key: 'one_way', perm: Permission.TenantOneWayRead, icon: 'location', group: 'fleet' },
  { key: 'capacity', perm: Permission.TenantCapacityRulesRead, icon: 'gauge', group: 'fleet' },
  { key: 'branches', perm: Permission.TenantBranchesRead, icon: 'building', group: 'operations' },
  { key: 'channels', perm: Permission.TenantChannelsRead, icon: 'link', group: 'operations' },
] as const satisfies readonly { key: string; perm: PermissionSlug; icon: string; group: string }[];

export type SectionKey = (typeof SECTIONS)[number]['key'];
export const SECTION_GROUPS = ['pricing', 'fleet', 'operations'] as const;

/** Mobile route of a hub section. */
export const SECTION_ROUTES: Record<SectionKey, string> = {
  rate_plans: '/config/rate-plans',
  matrix: '/config/rate-plans/matrix',
  date_rules: '/config/date-rules',
  extras: '/config/extras',
  campaigns: '/config/campaigns',
  preview: '/config/preview',
  segments: '/config/segments',
  groups: '/config/groups',
  products: '/config/products',
  one_way: '/config/one-way-rules',
  capacity: '/config/capacity-rules',
  branches: '/config/branches',
  channels: '/config/channels',
};

/** Panel page (under `/t/{slug}`) of a section or record, for the editors the app leaves to the panel. */
export const PANEL_PATHS = {
  rate_plans: 'pricing/rate-plans',
  matrix: 'pricing/rate-plans/matrix',
  date_rules: 'pricing/date-rules',
  extras: 'pricing/extras',
  campaigns: 'pricing/campaigns',
  preview: 'pricing/preview',
  segments: 'fleet/segments',
  groups: 'fleet/groups',
  products: 'fleet/products',
  one_way: 'fleet/one-way-rules',
  capacity: 'fleet/capacity-rules',
  branches: 'branches',
  channels: 'channels',
} as const satisfies Record<SectionKey, string>;

/** Pages whose records have their own panel page (`…/{uuid}`, branches `…/{uuid}/edit` to edit). */
const DETAIL_PAGES: readonly SectionKey[] = [
  'rate_plans',
  'date_rules',
  'extras',
  'campaigns',
  'segments',
  'groups',
  'products',
  'branches',
];

export function panelUrl(webUrl: string, slug: string, section: SectionKey, uuid?: string) {
  const base = `${webUrl.replace(/\/$/, '')}/t/${encodeURIComponent(slug)}/${PANEL_PATHS[section]}`;
  return uuid && DETAIL_PAGES.includes(section) ? `${base}/${encodeURIComponent(uuid)}` : base;
}

/** Sales channels of the settings (the panel's `SALES_CHANNELS`). */
export const SALES_CHANNELS = ['web', 'widget', 'api', 'branch', 'yolcu360', 'obilet'] as const;

/** `channels.{code}` of `config_app` for a known code, else the code itself. */
export function channelKey(code: string | null | undefined): string | null {
  if (!code) return null;
  return (SALES_CHANNELS as readonly string[]).includes(code) ? `config_app:channels.${code}` : null;
}

/** Band of a rate plan or the matrix: "1–3 gün" style range, open-ended as "30+". */
export function bandLabel(min: number, max: number | null | undefined) {
  if (max == null) return `${min}+`;
  return min === max ? String(min) : `${min}–${max}`;
}

export type Tone = 'neutral' | 'progress' | 'done' | 'problem';

/** Pill tone of a record status across the configuration lists. */
export function statusTone(status: string | null | undefined): Tone {
  switch (status) {
    case 'active':
    case 'published':
    case 'ok':
      return 'done';
    case 'draft':
    case 'scheduled':
    case 'pending':
      return 'progress';
    case 'failing':
    case 'expired':
    case 'exhausted':
      return 'problem';
    default:
      return 'neutral';
  }
}

// --------------------------------------------------------------- branch quick edit

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MONEY = /^[0-9]{1,12}([.,][0-9]{1,2})?$/;

export type BranchQuickValues = {
  name: string;
  phone: string;
  email: string;
  prep_minutes: string;
  is_active: boolean;
};

export function branchQuickDefaults(b: {
  name: string;
  phone: string;
  email: string;
  prep_minutes: number;
  is_active: boolean;
}): BranchQuickValues {
  return { name: b.name, phone: b.phone, email: b.email, prep_minutes: String(b.prep_minutes), is_active: b.is_active };
}

/** The panel's quick-edit drawer schema (`createQuickEditSchema`). */
export function validateBranchQuick(v: BranchQuickValues): Errors {
  const e: Errors = {};
  const name = v.name.trim();
  if (!name || name.length > 255) e.name = 'branches:validation.name_required';
  if (v.phone.length > 32) e.phone = 'config_app:validation.too_long';
  const email = v.email.trim();
  if (email && !EMAIL.test(email)) e.email = 'branches:validation.email';
  const prep = v.prep_minutes.trim();
  const n = Number(prep);
  if (prep === '' || !Number.isInteger(n) || n < 0 || n > 10080) e.prep_minutes = 'branches:validation.prep_minutes';
  return e;
}

export function branchQuickRequest(v: BranchQuickValues) {
  return {
    name: v.name.trim(),
    phone: v.phone.trim(),
    email: v.email.trim(),
    prep_minutes: Number(v.prep_minutes.trim()),
    is_active: v.is_active,
  };
}

// --------------------------------------------------------------- service point basics

export type ServicePointValues = {
  name: string;
  description: string;
  extra_fee: string;
  min_notice_minutes: string;
  online_selectable: boolean;
  delivery_enabled: boolean;
  is_active: boolean;
};

export function servicePointDefaults(p: {
  name: string;
  description: string;
  extra_fee: string;
  min_notice_minutes: number;
  online_selectable: boolean;
  delivery_enabled: boolean;
  is_active: boolean;
}): ServicePointValues {
  return {
    name: p.name,
    description: p.description,
    extra_fee: p.extra_fee || '0',
    min_notice_minutes: String(p.min_notice_minutes),
    online_selectable: p.online_selectable,
    delivery_enabled: p.delivery_enabled,
    is_active: p.is_active,
  };
}

/** The basic fields of the panel's service point schema (`createServicePointSchema`). */
export function validateServicePoint(v: ServicePointValues): Errors {
  const e: Errors = {};
  const name = v.name.trim();
  if (!name || name.length > 255) e.name = 'branches:validation.name_required';
  if (v.description.length > 2000) e.description = 'config_app:validation.too_long';
  if (!MONEY.test(v.extra_fee.trim())) e.extra_fee = 'branches:validation.extra_fee';
  if (!/^\d{0,5}$/.test(v.min_notice_minutes.trim()) || Number(v.min_notice_minutes || 0) > 10080)
    e.min_notice_minutes = 'branches:validation.min_notice';
  return e;
}

export function servicePointRequest(v: ServicePointValues) {
  return {
    name: v.name.trim(),
    description: v.description.trim(),
    extra_fee: v.extra_fee.trim().replace(',', '.'),
    min_notice_minutes: Number(v.min_notice_minutes.trim() || 0),
    online_selectable: v.online_selectable,
    delivery_enabled: v.delivery_enabled,
    is_active: v.is_active,
  };
}

// --------------------------------------------------------------- extra stock

/** A stock cell is a whole number 0–100000 (the API's `ExtraStockRequest`). */
export function validStock(text: string) {
  const v = text.trim();
  return /^\d{1,6}$/.test(v) && Number(v) <= 100000;
}

/** Changed, valid rows of the stock grid (the panel saves only these). */
export function stockChanges(rows: { branch: { uuid: string }; quantity: number }[], grid: Record<string, string>) {
  const changed = rows.filter((r) => grid[r.branch.uuid] !== undefined && grid[r.branch.uuid] !== String(r.quantity));
  const invalid = changed.filter((r) => !validStock(grid[r.branch.uuid]!)).map((r) => r.branch.uuid);
  return {
    invalid,
    items: changed.map((r) => ({ branch_uuid: r.branch.uuid, quantity: Number(grid[r.branch.uuid]!.trim()) })),
  };
}

// --------------------------------------------------------------- price preview

export type PreviewValues = {
  rental_product_uuid: string;
  branch_uuid: string;
  channel: string;
  start_day: string;
  start_time: string;
  end_day: string;
  end_time: string;
  coupon_code: string;
};

/** The panel's preview form rules for the fields the app has (no drafts, extras or delivery fee). */
export function validatePreview(v: PreviewValues): Errors {
  const e: Errors = {};
  if (!v.rental_product_uuid) e.rental_product_uuid = 'pricing:validation.product';
  if (!v.branch_uuid) e.branch_uuid = 'pricing:validation.branch';
  if (!v.channel) e.channel = 'pricing:validation.channel';
  if (!v.start_day) e.start_day = 'pricing:validation.start_date';
  if (!v.end_day) e.end_day = 'pricing:validation.end_date';
  if (v.start_day && v.end_day && `${v.end_day}T${v.end_time}` <= `${v.start_day}T${v.start_time}`)
    e.end_day = 'pricing:validation.end_after_start';
  if (v.coupon_code.length > 64) e.coupon_code = 'config_app:validation.too_long';
  return e;
}

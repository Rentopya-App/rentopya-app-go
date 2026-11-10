/**
 * Pure helpers of the company settings screens (no React, no API calls), so
 * `node --test` covers them. They mirror the panel's `/t/{slug}/settings/*`
 * rules: role keys, permission groups, access forms, support durations and
 * the masked credential hints of integrations.
 */

/** Panel route of a settings page, for the "open in panel" link of editors the app does not carry. */
export const PANEL_PAGES = {
  general: '',
  members: '/members',
  roles: '/roles',
  support: '/support-access',
  notifications: '/notifications',
  whatsapp: '/whatsapp',
  contractTemplates: '/contract-templates',
  inspectionTemplates: '/inspection-templates',
  invoices: '/invoices',
  publicApi: '/public-api',
  integrations: '/integrations',
  site: '/site',
  siteArticles: '/site-articles',
  siteLeads: '/site-leads',
} as const;

export type PanelPage = keyof typeof PANEL_PAGES;

/** `https://panel/t/{slug}/settings/...`; trailing slashes on the origin are dropped. */
export function panelUrl(webUrl: string, slug: string, page: PanelPage, suffix = '') {
  return `${webUrl.replace(/\/+$/, '')}/t/${encodeURIComponent(slug)}/settings${PANEL_PAGES[page]}${suffix}`;
}

// ---------------------------------------------------------------- roles

export const ROLE_KEY_PATTERN = /^[a-z][a-z0-9_]{1,63}$/;

const TR_FOLD: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' };

/** The panel's `roleKeyFromName`: "Gece Vardiyası" → "gece_vardiyasi". */
export function roleKeyFromName(name: string): string {
  return name
    .trim()
    .toLocaleLowerCase('tr')
    .replace(/[çğıöşü]/g, (ch) => TR_FOLD[ch] ?? ch)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
}

export type RoleDraft = { name: string; key: string; description: string; permissions: string[] };

export type RoleErrors = Partial<Record<'name' | 'key' | 'description', 'required' | 'too_long' | 'invalid'>>;

/** Same limits as the panel's role form (name 1–100, key pattern or empty, description ≤ 500). */
export function validateRole(d: RoleDraft, creating: boolean): RoleErrors {
  const e: RoleErrors = {};
  const name = d.name.trim();
  if (!name) e.name = 'required';
  else if (name.length > 100) e.name = 'too_long';
  if (creating && d.key.trim() && !ROLE_KEY_PATTERN.test(d.key.trim())) e.key = 'invalid';
  if (d.description.length > 500) e.description = 'too_long';
  return e;
}

/** Request body of a role save: the key only on create (it never changes afterwards). */
export function roleRequest(d: RoleDraft, creating: boolean) {
  const body: { name: string; description: string; permissions: string[]; key?: string } = {
    name: d.name.trim(),
    description: d.description.trim(),
    permissions: [...new Set(d.permissions)].sort(),
  };
  if (creating && d.key.trim()) body.key = d.key.trim();
  return body;
}

/** `tenant.fleet.read` → `tenant_fleet` (the panel's `tenantPermissionGroupKey`). */
export function permissionGroupKey(slug: string) {
  const [prefix, resource] = slug.split('.');
  if (prefix !== 'tenant' || !resource) return prefix || slug;
  return `tenant_${resource}`;
}

export type PermissionItem = { slug: string; name: string };

/** Catalog grouped by resource, in catalog order of each group's first slug. */
export function groupPermissions(items: PermissionItem[]) {
  const groups = new Map<string, PermissionItem[]>();
  for (const p of items) {
    const key = permissionGroupKey(p.slug);
    const list = groups.get(key) ?? [];
    list.push(p);
    groups.set(key, list);
  }
  return [...groups.entries()].map(([key, list]) => ({ key, items: list }));
}

/** Turns one permission on or off. */
export function togglePermission(selected: string[], slug: string, on: boolean) {
  const set = new Set(selected);
  if (on) set.add(slug);
  else set.delete(slug);
  return [...set];
}

/** Turns every permission of a group on, or all off when all were on already. */
export function toggleGroup(selected: string[], group: PermissionItem[]) {
  const set = new Set(selected);
  const all = group.every((p) => set.has(p.slug));
  for (const p of group) {
    if (all) set.delete(p.slug);
    else set.add(p.slug);
  }
  return [...set];
}

// ---------------------------------------------------------------- members and invitations

export type BranchScope = 'all' | 'selected';

export type AccessDraft = { roleUuids: string[]; scope: BranchScope; branchUuids: string[] };

export type AccessErrors = Partial<Record<'roles' | 'branches' | 'email', 'required' | 'invalid'>>;

/** Member access and invitation rules: at least one role, and branches when the scope is `selected`. */
export function validateAccess(d: AccessDraft): AccessErrors {
  const e: AccessErrors = {};
  if (!d.roleUuids.length) e.roles = 'required';
  if (d.scope === 'selected' && !d.branchUuids.length) e.branches = 'required';
  return e;
}

/** Body of `PATCH /members/{userUuid}` and `POST /invitations`: branches only with `selected`. */
export function accessBody(d: AccessDraft) {
  return {
    role_uuids: d.roleUuids,
    branch_scope: d.scope,
    ...(d.scope === 'selected' ? { branch_uuids: d.branchUuids } : {}),
  };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmail(v: string) {
  return EMAIL.test(v.trim());
}

/**
 * A branch-restricted member cannot hand out "every branch" (the API refuses
 * it): the form starts on `selected` for them, as in the panel.
 */
export function initialScope(callerScope: BranchScope | undefined, current?: BranchScope): BranchScope {
  if (callerScope === 'selected') return 'selected';
  return current ?? 'all';
}

export function fullName(u: { name: string; surname: string; email: string }) {
  return `${u.name} ${u.surname}`.trim() || u.email;
}

/** Pending invitations can be resent or revoked; the rest are history. */
export function invitationActions(status: string) {
  return status === 'pending' || status === 'expired'
    ? { resend: true, revoke: status === 'pending' }
    : { resend: false, revoke: false };
}

// ---------------------------------------------------------------- support access

/** Durations offered when opening support access (the API accepts 1 h – 7 d). */
export const SUPPORT_DURATIONS = [1, 4, 8, 24, 72, 168] as const;

export function durationKey(hours: number) {
  return hours < 24 ? `durations.h${hours}` : `durations.d${hours / 24}`;
}

/** The grant in force: the newest `active` one that has not expired yet. */
export function activeGrant<T extends { status: string; expires_at: string }>(items: T[], now = Date.now()) {
  return (
    items
      .filter((g) => g.status === 'active' && new Date(g.expires_at).getTime() > now)
      .sort((a, b) => new Date(b.expires_at).getTime() - new Date(a.expires_at).getTime())[0] ?? null
  );
}

// ---------------------------------------------------------------- integrations

/**
 * Masked credential hints as label/value rows. The API sends only hints
 * (`••••1234`), never secrets; anything that does not look masked is masked
 * again here, so a mistake upstream still never shows a value.
 */
export function credentialRows(hints: Record<string, string> | null | undefined) {
  return Object.entries(hints ?? {})
    .filter(([, v]) => typeof v === 'string' && v !== '')
    .map(([key, value]) => ({ key, value: maskHint(value) }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

export function maskHint(value: string) {
  if (/[•*]/.test(value)) return value;
  return value.length <= 4 ? '••••' : `••••${value.slice(-4)}`;
}

export type StatusTone = 'neutral' | 'progress' | 'done' | 'problem';

/** Pill tone of the statuses these screens show. */
export function statusTone(status: string): StatusTone {
  switch (status) {
    case 'active':
    case 'accepted':
    case 'connected':
    case 'published':
    case 'succeeded':
    case 'sent':
    case 'delivered':
    case 'done':
    case 'ok':
      return 'done';
    case 'pending':
    case 'processing':
    case 'submitted':
    case 'sending':
    case 'pairing':
    case 'created':
    case 'in_progress':
    case 'new':
    case 'draft':
    case 'waiting_dependency':
      return 'progress';
    case 'failed':
    case 'revoked':
    case 'disabled':
    case 'needs_verification':
    case 'blocked':
    case 'spam':
    case 'logged_out':
    case 'disconnected':
      return 'problem';
    default:
      return 'neutral';
  }
}

// ---------------------------------------------------------------- organization settings

/** Fields of the settings document the app edits; the rest is kept as loaded. */
export type MinutesField = 'staff_review_window_minutes' | 'payment_hold_minutes' | 'quote_validity_minutes';

/** "" → null, digits → number; anything else is left for the API to refuse. */
export function parseMinutes(v: string): number | null {
  const s = v.trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isInteger(n) ? n : NaN;
}

export function minutesText(n: number | null | undefined) {
  return n == null ? '' : String(n);
}

/** `reservation.approval_mode` → `approval_mode`, for the readiness list. */
export function missingKey(path: string) {
  return path.split('.').pop() ?? path;
}

/** A picked logo the API takes: PNG, JPEG, WebP or SVG up to 2 MB. */
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

export function logoProblem(file: { mimeType?: string | null; size?: number | null }) {
  const type = (file.mimeType ?? '').toLowerCase();
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(type)) return 'type' as const;
  if ((file.size ?? 0) > LOGO_MAX_BYTES) return 'size' as const;
  return null;
}

/** Title of a localized site text: the language asked for, then Turkish, then any. */
export function localized(text: { tr?: string; en?: string } | null | undefined, lang: string) {
  if (!text) return '';
  const own = lang.startsWith('en') ? text.en : text.tr;
  return own || text.tr || text.en || '';
}

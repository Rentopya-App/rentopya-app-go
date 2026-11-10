/**
 * Pure rules of the customer and agreement screens, mirrored from the panel
 * (`frontend/src/features/customers/schemas`, `lib/format`, the driver,
 * contact, consent and document dialogs, `tenant-settings/lib/tax-number`).
 * Errors are i18n keys of the shared panel catalog (`customers:validation.*`)
 * or of the app's own one (`customers_app:*`). Free of app imports so it runs
 * under `node --test`.
 */

export type Errors = Record<string, string>;

export type CustomerType = 'individual' | 'corporate';
export type IdentityType = 'tckn' | 'vkn' | 'passport';
export type ConsentChannel = 'sms' | 'email' | 'call' | 'whatsapp';
export type ConsentSource = 'counter' | 'web' | 'phone' | 'import' | 'other';
export type DocumentType =
  | 'identity'
  | 'passport'
  | 'driving_licence'
  | 'tax_certificate'
  | 'signature_circular'
  | 'contract'
  | 'other';
export type AgreementStatus = 'draft' | 'active' | 'suspended' | 'terminated';
export type AgreementValidity = 'upcoming' | 'current' | 'expired';
export type Tone = 'neutral' | 'progress' | 'done' | 'problem';

/** `none` in the identity choice clears the identity on save. */
export const NO_IDENTITY = 'none';

export const CUSTOMER_TYPES: CustomerType[] = ['individual', 'corporate'];
/** Identity kinds per customer type (same rule as the API). */
export const IDENTITY_TYPES_BY_CUSTOMER: Record<CustomerType, IdentityType[]> = {
  individual: ['tckn', 'passport'],
  corporate: ['vkn', 'tckn'],
};
export const CONSENT_CHANNELS: ConsentChannel[] = ['sms', 'email', 'call', 'whatsapp'];
export const CONSENT_SOURCES: ConsentSource[] = ['counter', 'web', 'phone', 'import', 'other'];
export const DOCUMENT_TYPES: DocumentType[] = [
  'identity',
  'passport',
  'driving_licence',
  'tax_certificate',
  'signature_circular',
  'contract',
  'other',
];
export const AGREEMENT_STATUSES: AgreementStatus[] = ['draft', 'active', 'suspended', 'terminated'];
export const AGREEMENT_STATUS_TONE: Record<AgreementStatus, Tone> = {
  draft: 'neutral',
  active: 'done',
  suspended: 'progress',
  terminated: 'problem',
};
export const VALIDITY_TONE: Record<AgreementValidity, Tone> = {
  upcoming: 'progress',
  current: 'done',
  expired: 'neutral',
};

/** Document files the API accepts (content is sniffed again there), at most 10 MB. */
export const DOCUMENT_CONTENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const;
export const MAX_DOCUMENT_FILE_BYTES = 10 * 1024 * 1024;

/** Common nationalities first (the panel's list); names come from `Intl.DisplayNames` when available. */
export const COUNTRY_CODES = [
  'TR',
  'DE',
  'GB',
  'NL',
  'FR',
  'BE',
  'AT',
  'CH',
  'IT',
  'ES',
  'SE',
  'NO',
  'DK',
  'FI',
  'PL',
  'RO',
  'BG',
  'GR',
  'CY',
  'RU',
  'UA',
  'BY',
  'GE',
  'AZ',
  'AM',
  'KZ',
  'UZ',
  'TM',
  'KG',
  'IR',
  'IQ',
  'SY',
  'LB',
  'JO',
  'IL',
  'SA',
  'AE',
  'QA',
  'KW',
  'BH',
  'OM',
  'EG',
  'LY',
  'TN',
  'DZ',
  'MA',
  'US',
  'CA',
  'BR',
  'CN',
  'JP',
  'KR',
  'IN',
  'PK',
  'AF',
  'AU',
] as const;

/** Localized country name of an ISO 3166-1 alpha-2 code (falls back to the code). */
export function countryName(code: string | null | undefined, locale: string) {
  if (!code) return '';
  try {
    const names = new Intl.DisplayNames([locale === 'tr' ? 'tr' : 'en'], { type: 'region' });
    return names.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

// ---- Turkish tax identity checks (orgsettings/usecase/validate.go) ----

/** Vergi Kimlik Numarası: 10 digits, GİB checksum. */
export function isValidVKN(value: string): boolean {
  if (!/^\d{10}$/.test(value)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const tmp = (Number(value[i]) + 9 - i) % 10;
    if (tmp === 0) continue;
    let p = (tmp * 2 ** (9 - i)) % 9;
    if (p === 0) p = 9;
    sum += p;
  }
  return (10 - (sum % 10)) % 10 === Number(value[9]);
}

/** T.C. Kimlik No: 11 digits, first not zero, two check digits. */
export function isValidTCKN(value: string): boolean {
  if (!/^[1-9]\d{10}$/.test(value)) return false;
  const d = [...value].map(Number);
  const odd = d[0] + d[2] + d[4] + d[6] + d[8];
  const even = d[1] + d[3] + d[5] + d[7];
  if ((((odd * 7 - even) % 10) + 10) % 10 !== d[9]) return false;
  const total = d.slice(0, 10).reduce((acc, n) => acc + n, 0);
  return total % 10 === d[10];
}

/** Identity number by kind (TCKN / VKN checksums; a passport has 5–20 letters or digits). */
export function identityError(kind: string, raw: string): string | null {
  const digits = raw.replace(/\s/g, '');
  if (kind === 'tckn') {
    if (!/^\d{11}$/.test(digits)) return 'customers:validation.tckn_length';
    return isValidTCKN(digits) ? null : 'customers:validation.tckn_checksum';
  }
  if (kind === 'vkn') {
    if (!/^\d{10}$/.test(digits)) return 'customers:validation.vkn_length';
    return isValidVKN(digits) ? null : 'customers:validation.vkn_checksum';
  }
  if (kind === 'passport') {
    const doc = raw.replace(/[^0-9A-Za-z]/g, '');
    return doc.length >= 5 && doc.length <= 20 ? null : 'customers:validation.passport';
  }
  return null;
}

/**
 * Turkish phone check of the forms (the API normalizes and validates again):
 * a national number (0532…, 532…) has 10 digits after the 0, an international
 * one starts with + and has 7 to 15 digits.
 */
export function isValidPhone(raw: string): boolean {
  const value = raw.trim();
  if (!value) return true;
  if (!/^[+0-9 ()-]+$/.test(value)) return false;
  const digits = value.replace(/\D/g, '');
  if (value.startsWith('+') || digits.startsWith('00')) {
    const intl = value.startsWith('+') ? digits : digits.slice(2);
    if (intl.startsWith('90')) return intl.length === 12;
    return intl.length >= 7 && intl.length <= 15;
  }
  if (digits.startsWith('90') && digits.length === 12) return true;
  if (digits.startsWith('0')) return digits.length === 11;
  return digits.length === 10;
}

export function isValidEmail(raw: string): boolean {
  const v = raw.trim();
  return !v || (v.length <= 255 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v));
}

/** "VIP, Filo" → ["VIP", "Filo"] (trimmed, unique, case-insensitive). */
export function splitTags(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,;]/)) {
    const tag = part.trim();
    if (!tag || seen.has(tag.toLocaleLowerCase('tr'))) continue;
    seen.add(tag.toLocaleLowerCase('tr'));
    out.push(tag);
  }
  return out;
}

// ---- Calendar days typed as GG.AA.YYYY (birth dates are decades back) ----

/** `12.03.1990` (also `/` or `-`) → `1990-03-12`; null when not a real day. Empty → ''. */
export function parseDay(raw: string): string | null {
  const v = raw.trim();
  if (!v) return '';
  const m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(v) ?? null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  const [y, mo, d] = m ? [Number(m[3]), Number(m[2]), Number(m[1])] : iso ? [+iso[1], +iso[2], +iso[3]] : [0, 0, 0];
  if (!y || y < 1900 || y > 2100 || mo < 1 || mo > 12 || d < 1) return null;
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** `1990-03-12` → `12.03.1990` for the typed field. */
export function dayText(iso: string | null | undefined): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
}

// ---- Customer form (customer-form.ts) ----

export type CustomerFormValues = {
  customer_type: CustomerType;
  first_name: string;
  last_name: string;
  company_title: string;
  identity_type: IdentityType | typeof NO_IDENTITY;
  /** Write-only: empty on edit keeps the stored number. */
  identity_number: string;
  nationality: string;
  tax_office: string;
  /** Write-only: empty on edit keeps the stored value. */
  phone: string;
  email: string;
  billing_address: string;
  billing_city: string;
  billing_district: string;
  billing_postal_code: string;
  billing_country: string;
  e_invoice: boolean;
  tags: string;
  note: string;
};

/** The stored customer, as far as the form needs it. */
export type StoredCustomer = {
  customer_type: CustomerType;
  first_name: string;
  last_name: string;
  company_title: string;
  identity_type: IdentityType | null;
  nationality: string | null;
  tax_office: string;
  billing: {
    address: string;
    city: string;
    district: string;
    postal_code: string;
    country: string | null;
    e_invoice: boolean;
  };
  tags: string[];
  note: string;
};

export type CustomerRequest = {
  customer_type: CustomerType;
  first_name?: string;
  last_name?: string;
  company_title?: string;
  identity_type?: IdentityType | null;
  identity_number?: string;
  nationality?: string | null;
  tax_office?: string;
  phone?: string;
  email?: string;
  billing_address?: string;
  billing_city?: string;
  billing_district?: string;
  billing_postal_code?: string;
  billing_country?: string | null;
  e_invoice?: boolean;
  note?: string;
  tags?: string[];
};

export function customerFormDefaults(c?: StoredCustomer): CustomerFormValues {
  return {
    customer_type: c?.customer_type ?? 'individual',
    first_name: c?.first_name ?? '',
    last_name: c?.last_name ?? '',
    company_title: c?.company_title ?? '',
    identity_type: c?.identity_type ?? (c ? NO_IDENTITY : 'tckn'),
    identity_number: '',
    nationality: c?.nationality ?? (c ? '' : 'TR'),
    tax_office: c?.tax_office ?? '',
    phone: '',
    email: '',
    billing_address: c?.billing.address ?? '',
    billing_city: c?.billing.city ?? '',
    billing_district: c?.billing.district ?? '',
    billing_postal_code: c?.billing.postal_code ?? '',
    billing_country: c?.billing.country ?? (c ? '' : 'TR'),
    e_invoice: c?.billing.e_invoice ?? false,
    tags: (c?.tags ?? []).join(', '),
    note: c?.note ?? '',
  };
}

export function validateCustomer(v: CustomerFormValues, mode: 'create' | 'edit', hasStoredIdentity: boolean): Errors {
  const e: Errors = {};
  if (v.customer_type === 'individual') {
    if (!v.first_name.trim()) e.first_name = 'customers:validation.required';
    if (!v.last_name.trim()) e.last_name = 'customers:validation.required';
  } else if (!v.company_title.trim()) {
    e.company_title = 'customers:validation.required';
  }
  if (v.identity_type !== NO_IDENTITY) {
    if (!IDENTITY_TYPES_BY_CUSTOMER[v.customer_type].includes(v.identity_type)) {
      e.identity_type = 'customers:validation.identity_type';
    }
    const number = v.identity_number.trim();
    // On edit an empty number keeps the stored one.
    const keep = mode === 'edit' && hasStoredIdentity && !number;
    if (!number && !keep) e.identity_number = 'customers:validation.required';
    else if (number) {
      const err = identityError(v.identity_type, number);
      if (err) e.identity_number = err;
    }
    if (v.identity_type === 'passport' && !v.nationality) e.nationality = 'customers:validation.nationality_passport';
  }
  if (!isValidPhone(v.phone)) e.phone = 'customers:validation.phone';
  if (!isValidEmail(v.email)) e.email = 'customers:validation.email';
  if (splitTags(v.tags).some((tag) => tag.length > 40)) e.tags = 'customers:validation.tag_length';
  return e;
}

/**
 * Form → request. Sensitive values are only sent when typed: on edit an
 * empty identity number / phone / e-mail keeps what is stored; "no identity"
 * clears it.
 */
export function customerRequest(
  v: CustomerFormValues,
  mode: 'create' | 'edit',
  stored?: Pick<StoredCustomer, 'identity_type'>,
): CustomerRequest {
  const corporate = v.customer_type === 'corporate';
  const body: CustomerRequest = {
    customer_type: v.customer_type,
    first_name: corporate ? '' : v.first_name.trim(),
    last_name: corporate ? '' : v.last_name.trim(),
    company_title: corporate ? v.company_title.trim() : '',
    nationality: v.nationality || null,
    tax_office: v.tax_office.trim(),
    billing_address: v.billing_address.trim(),
    billing_city: v.billing_city.trim(),
    billing_district: v.billing_district.trim(),
    billing_postal_code: v.billing_postal_code.trim(),
    billing_country: v.billing_country || null,
    e_invoice: v.e_invoice,
    tags: splitTags(v.tags),
    note: v.note.trim(),
  };
  if (v.identity_type === NO_IDENTITY) {
    if (mode === 'edit' && stored?.identity_type) body.identity_number = '';
  } else if (v.identity_number.trim()) {
    body.identity_type = v.identity_type;
    body.identity_number = v.identity_number.trim();
  } else if (mode === 'edit' && stored?.identity_type !== v.identity_type) {
    body.identity_type = v.identity_type;
  }
  if (v.phone.trim() || mode === 'create') body.phone = v.phone.trim();
  if (v.email.trim() || mode === 'create') body.email = v.email.trim();
  return body;
}

// ---- Contacts (customer-contacts-card.tsx) ----

export type ContactValues = {
  full_name: string;
  title: string;
  phone: string;
  email: string;
  is_primary: boolean;
  note: string;
};

export function validateContact(v: ContactValues): Errors {
  const e: Errors = {};
  if (!v.full_name.trim()) e.full_name = 'customers:validation.required';
  if (!isValidPhone(v.phone)) e.phone = 'customers:validation.phone';
  if (!isValidEmail(v.email)) e.email = 'customers:validation.email';
  return e;
}

/** Phone / e-mail only when typed on edit (empty keeps the stored value). */
export function contactRequest(v: ContactValues, editing: boolean) {
  return {
    full_name: v.full_name.trim(),
    title: v.title.trim(),
    is_primary: v.is_primary,
    note: v.note.trim(),
    ...(v.phone.trim() || !editing ? { phone: v.phone.trim() } : {}),
    ...(v.email.trim() || !editing ? { email: v.email.trim() } : {}),
  };
}

// ---- Drivers (customer-drivers-tab.tsx) ----

export type DriverValues = {
  copy_from_customer: boolean;
  first_name: string;
  last_name: string;
  /** Typed days (GG.AA.YYYY). */
  birth_date: string;
  phone: string;
  email: string;
  identity_type: 'none' | 'tckn' | 'passport';
  identity_number: string;
  nationality: string;
  licence_number: string;
  licence_class: string;
  licence_issued_on: string;
  licence_expires_on: string;
  licence_country: string;
  note: string;
};

export type StoredDriver = {
  first_name: string;
  last_name: string;
  birth_date: string | null;
  identity_type: 'tckn' | 'passport' | null;
  nationality: string | null;
  licence_class: string;
  licence_issued_on: string | null;
  licence_expires_on: string | null;
  licence_country: string | null;
  note: string;
};

export function driverFormDefaults(driver: StoredDriver | null, self: boolean): DriverValues {
  const editing = !!driver;
  return {
    copy_from_customer: !editing && self,
    first_name: driver?.first_name ?? '',
    last_name: driver?.last_name ?? '',
    birth_date: dayText(driver?.birth_date),
    phone: '',
    email: '',
    identity_type: driver?.identity_type ?? (editing ? 'none' : 'tckn'),
    identity_number: '',
    nationality: driver?.nationality ?? (editing ? '' : 'TR'),
    licence_number: '',
    licence_class: driver?.licence_class ?? 'B',
    licence_issued_on: dayText(driver?.licence_issued_on),
    licence_expires_on: dayText(driver?.licence_expires_on),
    licence_country: driver?.licence_country ?? 'TR',
    note: driver?.note ?? '',
  };
}

export function validateDriver(v: DriverValues): Errors {
  const e: Errors = {};
  if (!v.copy_from_customer) {
    if (!v.first_name.trim()) e.first_name = 'customers:validation.required';
    if (!v.last_name.trim()) e.last_name = 'customers:validation.required';
    if (v.identity_type !== 'none' && v.identity_number.trim()) {
      const err = identityError(v.identity_type, v.identity_number);
      if (err) e.identity_number = err;
    }
    if (!isValidPhone(v.phone)) e.phone = 'customers:validation.phone';
    if (!isValidEmail(v.email)) e.email = 'customers:validation.email';
  }
  const birth = parseDay(v.birth_date);
  const issued = parseDay(v.licence_issued_on);
  const expires = parseDay(v.licence_expires_on);
  if (birth === null) e.birth_date = 'customers_app:validation.day';
  if (issued === null) e.licence_issued_on = 'customers_app:validation.day';
  if (expires === null) e.licence_expires_on = 'customers_app:validation.day';
  const licence = v.licence_number.replace(/[^0-9A-Za-z]/g, '');
  if (v.licence_number.trim() && (licence.length < 4 || licence.length > 32)) {
    e.licence_number = 'customers:validation.licence';
  }
  if (issued && expires && expires < issued) e.licence_expires_on = 'customers:validation.licence_dates';
  if (birth && issued && issued < birth) e.licence_issued_on = 'customers:validation.licence_before_birth';
  return e;
}

export type DriverRequest = {
  copy_from_customer?: boolean;
  first_name?: string;
  last_name?: string;
  birth_date?: string | null;
  phone?: string;
  email?: string;
  identity_type?: 'tckn' | 'passport' | null;
  identity_number?: string;
  nationality?: string | null;
  licence_number?: string;
  licence_class?: string;
  licence_issued_on?: string | null;
  licence_expires_on?: string | null;
  licence_country?: string | null;
  note?: string;
};

/** Same body as the panel's driver dialog; call after `validateDriver` passed. */
export function driverRequest(v: DriverValues, stored: Pick<StoredDriver, 'identity_type'> | null): DriverRequest {
  const editing = !!stored;
  const body: DriverRequest = {
    birth_date: parseDay(v.birth_date) || null,
    licence_class: v.licence_class.trim(),
    licence_issued_on: parseDay(v.licence_issued_on) || null,
    licence_expires_on: parseDay(v.licence_expires_on) || null,
    licence_country: v.licence_country || null,
    note: v.note.trim(),
  };
  if (v.copy_from_customer) {
    body.copy_from_customer = true;
  } else {
    body.first_name = v.first_name.trim();
    body.last_name = v.last_name.trim();
    body.nationality = v.nationality || null;
    if (v.identity_type === 'none') {
      if (stored?.identity_type) body.identity_number = '';
    } else if (v.identity_number.trim()) {
      body.identity_type = v.identity_type;
      body.identity_number = v.identity_number.trim();
    }
    if (v.phone.trim() || !editing) body.phone = v.phone.trim();
    if (v.email.trim() || !editing) body.email = v.email.trim();
  }
  if (v.licence_number.trim()) body.licence_number = v.licence_number.trim();
  return body;
}

/** Eligibility thresholds: whole numbers 0–999 (the panel's check dialog). */
export function validateEligibility(minAge: string, minYears: string): Errors {
  const e: Errors = {};
  if (!/^\d{1,3}$/.test(minAge.trim())) e.min_driver_age = 'customers:validation.number';
  if (!/^\d{1,3}$/.test(minYears.trim())) e.min_license_years = 'customers:validation.number';
  return e;
}

// ---- Consents (customer-consents-tab.tsx) ----

export type ConsentValues = { source: ConsentSource; text_version: string; date: string; note: string };

export function validateConsent(v: ConsentValues, granting: boolean): Errors {
  const e: Errors = {};
  if (granting && !v.text_version.trim()) e.text_version = 'customers:validation.required';
  return e;
}

export function consentRequest(channel: ConsentChannel, action: 'grant' | 'withdraw', v: ConsentValues) {
  return {
    channel,
    action,
    source: v.source,
    text_version: v.text_version.trim(),
    note: v.note.trim(),
    // The panel's rule: a picked day is noon in Istanbul, empty is now.
    at: v.date ? `${v.date}T12:00:00+03:00` : null,
  };
}

// ---- Documents (customer-documents-tab.tsx) ----

export type PickedFile = { uri: string; name: string; contentType: string; size: number | null };

/** The content type of a picked file (the picker's, else from the extension); null when the API would refuse it. */
export function documentContentType(mime: string | null | undefined, name: string): string | null {
  const m = (mime ?? '').toLowerCase();
  if ((DOCUMENT_CONTENT_TYPES as readonly string[]).includes(m)) return m;
  if (m === 'image/jpg') return 'image/jpeg';
  const ext = name.toLowerCase().split('.').pop() ?? '';
  const byExt: Record<string, string> = {
    pdf: 'application/pdf',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
  };
  return m && !m.startsWith('image/') && m !== 'application/octet-stream' ? null : (byExt[ext] ?? null);
}

/** A file name with the extension of its content type (`kimlik-1700000000.jpg`). */
export function documentFileName(base: string, contentType: string, now: number) {
  const ext = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[contentType];
  const safe =
    base
      .replace(/ı/g, 'i')
      .normalize('NFKD')
      .replace(/[^\w-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'document';
  return `${safe}-${Math.floor(now / 1000)}.${ext ?? 'bin'}`;
}

export function fileTooLarge(size: number | null | undefined) {
  return size != null && size > MAX_DOCUMENT_FILE_BYTES;
}

// ---- Reveal window ----

/** Seconds left of a reveal that ends at `expiresAt` (ms). */
export function secondsLeft(expiresAt: number, now: number) {
  return Math.max(0, Math.ceil((expiresAt - now) / 1000));
}

/** A reveal needs a reason of 3 to 500 characters. */
export function validReason(reason: string) {
  const r = reason.trim();
  return r.length >= 3 && r.length <= 500;
}

// ---- Labels ----

export const typeKey = (t: CustomerType) => `customers:types.${t}`;
export const identityKey = (t: IdentityType | 'none') => `customers:identity_types.${t}`;
export const consentKey = (c: ConsentChannel | 'none') => `customers:consent_channels.${c}`;
export const sourceKey = (s: ConsentSource) => `customers:consent_sources.${s}`;
export const docTypeKey = (d: DocumentType) => `customers:document_types.${d}`;
export const eligibilityKey = (r: string) => `customers:eligibility.reasons.${r}`;
export const agreementStatusKey = (s: AgreementStatus) => `agreements:statuses.${s}`;
export const validityKey = (v: AgreementValidity) => `agreements:validities.${v}`;
export const invoicePeriodKey = (p: 'monthly' | 'per_rental') => `agreements:invoice_periods.${p}`;
export const contactRoleKey = (r: 'signatory' | 'billing' | 'operations' | 'other') => `agreements:contact_roles.${r}`;

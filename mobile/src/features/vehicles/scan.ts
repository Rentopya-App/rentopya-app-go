/**
 * What a scanned code means. Vehicle QR labels carry the app link
 * `rentopya://vehicle/{uuid}` (the same link opens the vehicle when the
 * system camera scans it); anything that reads like a plate is searched as
 * one (`GET /v1/tenant/vehicles?q=`, the API ignores spaces and dashes).
 * Free of app imports so it runs under `node --test`.
 */

export const VEHICLE_LINK_PREFIX = 'rentopya://vehicle/';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** `rentopya://vehicle/{uuid}`, also with an empty host (`rentopya:///vehicle/…`), a trailing slash or a query. */
const LINK = /^rentopya:\/\/\/?vehicle\/([^/?#\s]+)\/?(?:[?#]\S*)?$/i;
/** The panel's plate rule (vehicle form): 2–20 letters, digits, spaces or dashes. */
const PLATE = /^[A-Za-z0-9][A-Za-z0-9 -]{0,18}[A-Za-z0-9]$/;

export type ScanResult = { kind: 'vehicle'; uuid: string } | { kind: 'plate'; plate: string } | { kind: 'unknown' };

/** The link printed on a vehicle's QR label. */
export function vehicleLink(uuid: string) {
  return `${VEHICLE_LINK_PREFIX}${uuid}`;
}

/** Upper case, single spaces: "34 abc  123" → "34 ABC 123" (ASCII only, plates have no Turkish letters). */
export function normalizePlate(text: string) {
  return text.trim().replace(/\s+/g, ' ').toUpperCase();
}

/** True for plate-like text: the panel's plate format with at least one letter and one digit (no bare EAN numbers). */
export function looksLikePlate(text: string) {
  const t = text.trim().replace(/\s+/g, ' ');
  return PLATE.test(t) && /[A-Za-z]/.test(t) && /\d/.test(t);
}

export function parseScan(raw: string | null | undefined): ScanResult {
  const text = (raw ?? '').trim();
  if (!text) return { kind: 'unknown' };
  const link = LINK.exec(text);
  if (link) return UUID.test(link[1]) ? { kind: 'vehicle', uuid: link[1].toLowerCase() } : { kind: 'unknown' };
  if (/^[a-z][a-z0-9+.-]*:/i.test(text)) return { kind: 'unknown' };
  if (looksLikePlate(text)) return { kind: 'plate', plate: normalizePlate(text) };
  return { kind: 'unknown' };
}

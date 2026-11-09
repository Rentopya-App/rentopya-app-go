/**
 * Label keys (shared panel catalogs) and pill tones of the vehicle states,
 * the panel's colour choice mapped onto the app's four tones.
 * Free of app imports so it runs under `node --test`.
 */
import type { BlockKind, VehicleStatus } from './forms.ts';

export type Tone = 'neutral' | 'progress' | 'done' | 'problem';

export const STATUS_TONE: Record<VehicleStatus, Tone> = {
  available: 'done',
  preparing: 'progress',
  rented: 'neutral',
  return_check: 'progress',
  cleaning: 'progress',
  maintenance: 'problem',
  damaged: 'problem',
  in_transfer: 'neutral',
  out_of_service: 'neutral',
};

export const statusKey = (s: string) => `vehicles:status.${s}`;
export const blockKindKey = (k: BlockKind | string) => `vehicle_blocks:kind.${k}`;
export const blockStateKey = (s: string) => `vehicle_blocks:state.${s}`;
export const docTypeKey = (s: string) => `vehicle_records:doc_type.${s}`;
export const docStatusKey = (s: string) => `vehicle_records:doc_status.${s}`;
export const maintenanceTypeKey = (s: string) => `vehicle_records:maintenance_type.${s}`;
export const maintenanceStatusKey = (s: string) => `vehicle_records:maintenance_status.${s}`;
export const rentalStatusKey = (s: string) => `vehicles_app:rental_status.${s}`;

export const BLOCK_STATE_TONE: Record<string, Tone> = { scheduled: 'progress', active: 'problem', ended: 'neutral' };

export const DOC_STATUS_TONE: Record<string, Tone> = {
  none: 'neutral',
  valid: 'done',
  expiring: 'progress',
  expired: 'problem',
};

export const MAINTENANCE_STATUS_TONE: Record<string, Tone> = {
  done: 'done',
  scheduled: 'neutral',
  due: 'progress',
  overdue: 'problem',
};

/** Rentals that hold the vehicle now (`GET /v1/tenant/rentals?vehicle=&status=`). */
export const OPEN_RENTAL_STATUSES = 'preparation,active,return_check';

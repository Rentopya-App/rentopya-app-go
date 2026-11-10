/**
 * The upload queue's rules, free of app imports so they run under
 * `node --test` (`machine.test.ts`): which job runs next, what request a job
 * makes in its current state, how an answer moves it on, and the retry
 * schedule. `queue.ts` persists the jobs and runs the requests.
 *
 * Inspection evidence (docs/design/inspections.md):
 *   photo:      POST /photos {client_ref = job id}  →  PUT <upload.path> (multipart <upload.field>)
 *               →  POST /photos/{photo}/complete
 *   signature:  POST /signature (strokes + PNG; signing again replaces the draft's signature)
 */

export type UploadKind = 'photo' | 'signature';

/**
 * `queued`: on the device, not announced yet. `announced`: the API issued the
 * upload address. `uploaded`: bytes stored, waiting for the server check.
 * `done`: the server holds the evidence. `failed`: gave up; `retryFailed`
 * puts it back in line.
 */
export type UploadState = 'queued' | 'announced' | 'uploaded' | 'done' | 'failed';

/** API-issued upload address (`InspectionUploadTarget`). */
export type UploadTarget = { method: string; path: string; field: string; maxBytes: number };

export type PhotoMeta = {
  /** Template slot key, `damage` (with `damageUuid`) or `extra`. */
  slot: string;
  damageUuid?: string;
  contentType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic' | 'image/heif';
  sizeBytes: number;
  fileName: string;
  /** Device capture time (EXIF or the camera callback), ISO 8601 with an offset. */
  capturedAt?: string;
  /** Device GPS at capture, kept for the status sheet; the API reads the EXIF block itself. */
  gps?: { lat: number; lng: number };
  /** Free label shown in the status sheet (angle, damage point). */
  label?: string;
};

export type SignatureMeta = {
  signerName: string;
  signerRole?: 'customer' | 'driver';
  strokes: { width: number; height: number; strokes: number[][][] };
  signedAt?: string;
  contract?: { document_uuid: string; version_uuid: string; content_hash: string };
  label?: string;
};

export type UploadJob = {
  /** UUID; sent as `client_ref`, so a retry is answered with the same photo. */
  id: string;
  /** Who captured it: only that user's session sends it. */
  userUuid: string;
  /** Organization it was captured in; sent as `X-Organization` whatever the UI shows now. */
  orgSlug: string;
  inspectionUuid: string;
  kind: UploadKind;
  /** File under the app's document directory (photo, or the signature PNG). */
  localPath: string;
  meta: PhotoMeta | SignatureMeta;
  state: UploadState;
  /** Failed answers from the server (counted against MAX_ATTEMPTS). */
  attempts: number;
  /** Consecutive network failures (no answer): back off, but never give up on them. */
  networkRetries: number;
  /** Epoch ms; not run before. */
  nextAttemptAt: number;
  lastError: string | null;
  lastErrorCode: string | null;
  photoUuid: string | null;
  upload: UploadTarget | null;
  /** FIFO order (per inspection). */
  seq: number;
  createdAt: number;
  updatedAt: number;
};

export const MAX_ATTEMPTS = 8;
export const BACKOFF_BASE_MS = 2_000;
export const BACKOFF_CAP_MS = 5 * 60_000;

/**
 * Exponential backoff with jitter: base·2^(n-1), capped, then a random
 * 50–100 % of it so many devices coming back online do not retry together.
 * `n` is the failure count (1 = first retry). `random` is in [0, 1).
 */
export function backoffDelay(n: number, random: () => number = Math.random) {
  const exp = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, n - 1));
  return Math.round(exp * (0.5 + 0.5 * random()));
}

/** Waiting to be sent (not done, not failed). */
export function isPending(job: Pick<UploadJob, 'state'>) {
  return job.state === 'queued' || job.state === 'announced' || job.state === 'uploaded';
}

function byOrder(a: UploadJob, b: UploadJob) {
  return a.seq - b.seq || a.createdAt - b.createdAt || a.id.localeCompare(b.id);
}

/**
 * The job to run now, or null. Each inspection is a FIFO line: only its
 * oldest pending job may run, and a head that is backing off holds the jobs
 * behind it. Failed jobs step out of the line. Lines of different
 * inspections do not wait for each other. Only `userUuid`'s jobs run.
 */
export function nextRunnable(jobs: readonly UploadJob[], now: number, userUuid: string | null): UploadJob | null {
  if (!userUuid) return null;
  const heads = new Map<string, UploadJob>();
  for (const j of [...jobs].sort(byOrder)) {
    if (j.userUuid !== userUuid || !isPending(j) || heads.has(j.inspectionUuid)) continue;
    heads.set(j.inspectionUuid, j);
  }
  let best: UploadJob | null = null;
  for (const j of heads.values()) {
    if (j.nextAttemptAt > now) continue;
    if (!best || byOrder(j, best) < 0) best = j;
  }
  return best;
}

/** When the earliest waiting head may run (for the worker's timer), or null. */
export function nextWakeAt(jobs: readonly UploadJob[], userUuid: string | null): number | null {
  if (!userUuid) return null;
  const heads = new Map<string, UploadJob>();
  for (const j of [...jobs].sort(byOrder)) {
    if (j.userUuid !== userUuid || !isPending(j) || heads.has(j.inspectionUuid)) continue;
    heads.set(j.inspectionUuid, j);
  }
  let at: number | null = null;
  for (const j of heads.values()) at = at === null ? j.nextAttemptAt : Math.min(at, j.nextAttemptAt);
  return at;
}

/** The request a job makes in its state. */
export type Step =
  | { kind: 'announce'; path: string; body: Record<string, unknown> }
  | { kind: 'upload'; method: string; path: string; field: string }
  | { kind: 'complete'; path: string }
  | { kind: 'signature'; path: string; body: Omit<Record<string, unknown>, 'png_base64'> };

/** Every request of a job carries the job's organization, never the one picked in the UI now. */
export function requestHeaders(job: Pick<UploadJob, 'orgSlug'>): { 'X-Organization': string } {
  return { 'X-Organization': job.orgSlug };
}

export function stepOf(job: UploadJob): Step | null {
  const base = `/v1/tenant/inspections/${job.inspectionUuid}`;
  if (job.kind === 'signature') {
    if (job.state !== 'queued') return null;
    const m = job.meta as SignatureMeta;
    return {
      kind: 'signature',
      path: `${base}/signature`,
      body: {
        signer_name: m.signerName,
        signer_role: m.signerRole,
        strokes: m.strokes,
        device_signed_at: m.signedAt,
        contract: m.contract,
      },
    };
  }
  const m = job.meta as PhotoMeta;
  switch (job.state) {
    case 'queued':
      return {
        kind: 'announce',
        path: `${base}/photos`,
        body: {
          slot: m.slot,
          damage_uuid: m.damageUuid,
          client_ref: job.id,
          content_type: m.contentType,
          size_bytes: m.sizeBytes,
          device_captured_at: m.capturedAt,
        },
      };
    case 'announced':
      // The address exactly as the API issued it; storage keys never reach the device.
      return job.upload
        ? { kind: 'upload', method: job.upload.method, path: job.upload.path, field: job.upload.field }
        : null;
    case 'uploaded':
      return job.photoUuid ? { kind: 'complete', path: `${base}/photos/${job.photoUuid}/complete` } : null;
    default:
      return null;
  }
}

/** What a step's request answered. */
export type StepResult =
  | {
      ok: true;
      /** Announce: the photo (new, or the one an earlier try created) and its upload address. */
      photo?: { uuid: string; status: 'pending' | 'uploaded' | 'completed' };
      upload?: UploadTarget;
    }
  | {
      ok: false;
      /** HTTP status; 0 = no answer (offline, timeout, connection dropped). */
      status: number;
      /** Envelope `error.code`. */
      code: string;
      /** First `error.details[].code` (the inspection state reason on a 409). */
      reason?: string;
      message?: string;
    };

/** How a failed answer is handled. */
export type FailureClass =
  /** No answer: the request may or may not have reached the server; resend the same request later. */
  | 'network'
  /** The server already holds it (the earlier, unanswered try went through). */
  | 'exists'
  /** The stored bytes are gone or wrong: upload again. */
  | 'reupload'
  /** Worth another try later (server error, busy, concurrent edit, session refresh). */
  | 'retry'
  /** Will never succeed as is (validation, permission, finalized form, deleted record). */
  | 'fatal';

/** 409 reasons of the inspections API (`StateError.Code`). */
const REUPLOAD = new Set(['not_uploaded', 'object_missing', 'size_mismatch']);
const FATAL_409 = new Set(['finalized', 'infected', 'invalid_type']);

export function classify(step: Step['kind'], r: Extract<StepResult, { ok: false }>): FailureClass {
  if (r.status === 0) return 'network';
  if (r.status === 401) return 'retry';
  if (r.status === 408 || r.status === 429 || r.status >= 500) return 'retry';
  if (r.status === 409) {
    const reason = r.reason ?? '';
    // PUT on a completed photo: an earlier upload and completion already went through.
    if (reason === 'completed' && (step === 'upload' || step === 'complete')) return 'exists';
    // The signature already approved the contract: the earlier try went through.
    if (reason === 'signature_bound' && step === 'signature') return 'exists';
    if (REUPLOAD.has(reason)) return 'reupload';
    if (FATAL_409.has(reason)) return 'fatal';
    return 'retry';
  }
  return 'fatal';
}

/** Moves a job on after its step answered. Pure: returns a new job. */
export function advance(
  job: UploadJob,
  step: Step['kind'],
  r: StepResult,
  now: number,
  random: () => number = Math.random,
): UploadJob {
  const base = { ...job, updatedAt: now };
  if (r.ok) {
    const ok = { ...base, networkRetries: 0, lastError: null, lastErrorCode: null, nextAttemptAt: now };
    switch (step) {
      case 'announce': {
        if (!r.photo || !r.upload) return fail(ok, 'BAD_RESPONSE', 'missing photo or upload address', now, random);
        const size = (job.meta as PhotoMeta).sizeBytes;
        if (r.upload.maxBytes > 0 && size > r.upload.maxBytes)
          return {
            ...ok,
            state: 'failed',
            lastErrorCode: 'TOO_LARGE',
            lastError: 'file is larger than the API accepts',
          };
        const next: UploadState =
          r.photo.status === 'completed' ? 'done' : r.photo.status === 'uploaded' ? 'uploaded' : 'announced';
        return { ...ok, state: next, photoUuid: r.photo.uuid, upload: r.upload };
      }
      case 'upload':
        return { ...ok, state: 'uploaded' };
      case 'complete':
      case 'signature':
        return { ...ok, state: 'done' };
    }
  }
  const cls = classify(step, r);
  const code = r.code || `HTTP_${r.status}`;
  const msg = r.message ?? null;
  switch (cls) {
    case 'exists':
      return { ...base, state: 'done', networkRetries: 0, lastError: null, lastErrorCode: null };
    case 'network': {
      const n = job.networkRetries + 1;
      return {
        ...base,
        networkRetries: n,
        lastError: msg,
        lastErrorCode: code,
        nextAttemptAt: now + backoffDelay(job.attempts + n, random),
      };
    }
    case 'reupload': {
      const out = fail(base, code, msg, now, random);
      return out.state === 'failed' ? out : { ...out, state: job.photoUuid && job.upload ? 'announced' : 'queued' };
    }
    case 'retry':
      return fail(base, code, msg, now, random);
    case 'fatal':
      return { ...base, state: 'failed', attempts: job.attempts + 1, lastErrorCode: code, lastError: msg };
  }
}

function fail(job: UploadJob, code: string, msg: string | null, now: number, random: () => number): UploadJob {
  const attempts = job.attempts + 1;
  if (attempts >= MAX_ATTEMPTS)
    return { ...job, state: 'failed', attempts, networkRetries: 0, lastErrorCode: code, lastError: msg };
  return {
    ...job,
    attempts,
    networkRetries: 0,
    lastErrorCode: code,
    lastError: msg,
    nextAttemptAt: now + backoffDelay(attempts, random),
  };
}

/**
 * A failed job back in line (manual "Yeniden dene"). It is announced again
 * with the same `client_ref`: the API answers the existing photo with its
 * current status, so nothing is uploaded twice.
 */
export function retry(job: UploadJob, now: number): UploadJob {
  if (job.state !== 'failed') return job;
  return { ...job, state: 'queued', attempts: 0, networkRetries: 0, nextAttemptAt: now, updatedAt: now };
}

/** Connectivity came back or the app returned to the foreground: waiting jobs may run now. */
export function wake(job: UploadJob, now: number): UploadJob {
  if (!isPending(job) || job.nextAttemptAt <= now || job.networkRetries === 0) return job;
  return { ...job, nextAttemptAt: now };
}

export type QueueCounts = { pending: number; failed: number };

export function countsOf(jobs: readonly UploadJob[], filter: (j: UploadJob) => boolean = () => true): QueueCounts {
  let pending = 0;
  let failed = 0;
  for (const j of jobs) {
    if (!filter(j)) continue;
    if (isPending(j)) pending++;
    else if (j.state === 'failed') failed++;
  }
  return { pending, failed };
}

const EXT: Record<string, PhotoMeta['contentType']> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
};

/** The image type of a capture: the picker's mime type when it is one the API accepts, else the file extension. */
export function photoContentType(uri: string, mimeType?: string | null): PhotoMeta['contentType'] | null {
  const m = mimeType?.toLowerCase();
  if (m && Object.values(EXT).includes(m as PhotoMeta['contentType'])) return m as PhotoMeta['contentType'];
  const ext = uri.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  return EXT[ext] ?? null;
}

export function extensionOf(type: PhotoMeta['contentType']) {
  return type === 'image/jpeg' ? 'jpg' : type.slice('image/'.length);
}

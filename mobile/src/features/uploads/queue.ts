import { randomUUID } from 'expo-crypto';
import { create } from 'zustand';

import { useSession } from '@/core/auth/session';
import { queryClient } from '@/core/query';

import { fileExists, keepBase64, keepFile, removeFile } from './files';
import { deleteJob, loadJobs, saveJob } from './job-store';
import {
  advance,
  countsOf,
  extensionOf,
  isPending,
  nextRunnable,
  nextWakeAt,
  type PhotoMeta,
  photoContentType,
  type QueueCounts,
  retry,
  type SignatureMeta,
  stepOf,
  type UploadJob,
  wake,
} from './machine';
import { runStep } from './transport';

/**
 * The persistent upload queue for inspection evidence (photos and the
 * signature). Jobs and files are stored on the device first, then sent in
 * the background: FIFO per inspection, resumed on launch, on foreground and
 * when the connection returns, with backoff. See `machine.ts` for the rules.
 */
type QueueState = {
  loaded: boolean;
  jobs: UploadJob[];
  /** Job being sent right now. */
  activeId: string | null;
  /** Last known connectivity; false pauses the worker. */
  online: boolean;
};

export const useQueueStore = create<QueueState>(() => ({ loaded: false, jobs: [], activeId: null, online: true }));

let loading: Promise<void> | null = null;
/** Serializes writes so the sqlite rows follow the in-memory order. */
let writes: Promise<unknown> = Promise.resolve();

function ensureLoaded() {
  loading ??= loadJobs()
    .then((jobs) => {
      // Merge with jobs enqueued while loading.
      const known = new Set(useQueueStore.getState().jobs.map((j) => j.id));
      useQueueStore.setState((s) => ({ loaded: true, jobs: [...jobs.filter((j) => !known.has(j.id)), ...s.jobs] }));
    })
    .catch(() => {
      useQueueStore.setState({ loaded: true });
    });
  return loading;
}

function put(job: UploadJob) {
  useQueueStore.setState((s) => {
    const i = s.jobs.findIndex((j) => j.id === job.id);
    const jobs = i < 0 ? [...s.jobs, job] : s.jobs.map((j, k) => (k === i ? job : j));
    return { jobs };
  });
  const p = (writes = writes.then(() => saveJob(job)).catch(() => undefined));
  return p;
}

function drop(job: UploadJob) {
  useQueueStore.setState((s) => ({ jobs: s.jobs.filter((j) => j.id !== job.id) }));
  removeFile(job.localPath);
  const p = (writes = writes.then(() => deleteJob(job.id)).catch(() => undefined));
  return p;
}

function nextSeq() {
  return useQueueStore.getState().jobs.reduce((m, j) => Math.max(m, j.seq), 0) + 1;
}

function currentUser() {
  const s = useSession.getState();
  return s.status === 'signedIn' ? (s.me?.user.uuid ?? null) : null;
}

function newJob(
  input: { orgSlug: string; inspectionUuid: string },
  kind: UploadJob['kind'],
  id: string,
  localPath: string,
  meta: UploadJob['meta'],
): UploadJob {
  const user = currentUser();
  if (!user) throw new Error('not signed in');
  const now = Date.now();
  return {
    id,
    userUuid: user,
    orgSlug: input.orgSlug,
    inspectionUuid: input.inspectionUuid,
    kind,
    localPath,
    meta,
    state: 'queued',
    attempts: 0,
    networkRetries: 0,
    nextAttemptAt: now,
    lastError: null,
    lastErrorCode: null,
    photoUuid: null,
    upload: null,
    seq: nextSeq(),
    createdAt: now,
    updatedAt: now,
  };
}

export type EnqueuePhotoInput = {
  /** Organization the inspection belongs to (the picked one at capture time). */
  orgSlug: string;
  inspectionUuid: string;
  /** Captured image (camera / picker URI). Copied into the app's document directory. */
  uri: string;
  mimeType?: string | null;
  /** Template slot key, `damage` (with `damageUuid`) or `extra`. */
  slot: string;
  damageUuid?: string;
  capturedAt?: string;
  gps?: { lat: number; lng: number };
  label?: string;
};

/** Stores a photo on the device and queues it; returns the job id (its `client_ref`). */
export async function enqueuePhoto(input: EnqueuePhotoInput): Promise<string> {
  await ensureLoaded();
  const type = photoContentType(input.uri, input.mimeType);
  if (!type) throw new Error('unsupported image type');
  const id = randomUUID();
  const fileName = `${id}.${extensionOf(type)}`;
  const kept = await keepFile(input.uri, fileName);
  const meta: PhotoMeta = {
    slot: input.slot,
    damageUuid: input.damageUuid,
    contentType: type,
    sizeBytes: kept.size,
    fileName,
    capturedAt: input.capturedAt,
    gps: input.gps,
    label: input.label,
  };
  await put(newJob(input, 'photo', id, kept.uri, meta));
  kick();
  return id;
}

export type EnqueueSignatureInput = {
  orgSlug: string;
  inspectionUuid: string;
  /** The canvas PNG, base64 (a `data:image/png;base64,` prefix is accepted). */
  pngBase64: string;
  signerName: string;
  signerRole?: 'customer' | 'driver';
  strokes: SignatureMeta['strokes'];
  signedAt?: string;
  contract?: SignatureMeta['contract'];
  label?: string;
};

/** Stores the signature on the device and queues it; returns the job id. */
export async function enqueueSignature(input: EnqueueSignatureInput): Promise<string> {
  await ensureLoaded();
  const id = randomUUID();
  const b64 = input.pngBase64.replace(/^data:image\/png;base64,/, '');
  const kept = await keepBase64(b64, `${id}.png`);
  const meta: SignatureMeta = {
    signerName: input.signerName,
    signerRole: input.signerRole,
    strokes: input.strokes,
    signedAt: input.signedAt,
    contract: input.contract,
    label: input.label,
  };
  // Signing again replaces the draft's signature on the server; an older queued one is dropped.
  for (const j of useQueueStore.getState().jobs) {
    const stale = j.kind === 'signature' && j.inspectionUuid === input.inspectionUuid;
    if (stale && useQueueStore.getState().activeId !== j.id) await drop(j);
  }
  await put(newJob(input, 'signature', id, kept.uri, meta));
  kick();
  return id;
}

/** Puts failed jobs back in line (all, or one inspection's). */
export async function retryFailed(inspectionUuid?: string) {
  await ensureLoaded();
  const now = Date.now();
  for (const j of useQueueStore.getState().jobs) {
    if (j.state === 'failed' && (!inspectionUuid || j.inspectionUuid === inspectionUuid)) await put(retry(j, now));
  }
  kick();
}

/** Removes a job and its file (a retaken photo, a discarded form). */
export async function removeJob(id: string) {
  await ensureLoaded();
  const job = useQueueStore.getState().jobs.find((j) => j.id === id);
  if (job && useQueueStore.getState().activeId !== id) await drop(job);
}

export function countsFor(inspectionUuid?: string): QueueCounts {
  const user = currentUser();
  return countsOf(
    useQueueStore.getState().jobs,
    (j) => j.userUuid === user && (!inspectionUuid || j.inspectionUuid === inspectionUuid),
  );
}

/**
 * Resolves once nothing of the inspection is waiting to be sent (`pending`
 * 0); `failed` says how many gave up. The wizard calls it before "complete
 * handover". With `timeoutMs`, resolves with the counts at that moment.
 */
export async function waitUntilDrained(
  inspectionUuid: string,
  opts: { timeoutMs?: number } = {},
): Promise<QueueCounts> {
  await ensureLoaded();
  kick();
  const now = countsFor(inspectionUuid);
  if (now.pending === 0) return now;
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      unsub();
      if (timer) clearTimeout(timer);
      resolve(countsFor(inspectionUuid));
    };
    const unsub = useQueueStore.subscribe(() => {
      if (countsFor(inspectionUuid).pending === 0) finish();
    });
    if (opts.timeoutMs !== undefined) timer = setTimeout(finish, opts.timeoutMs);
  });
}

// --- worker -------------------------------------------------------------

let running = false;
let again = false;
let timer: ReturnType<typeof setTimeout> | null = null;

function schedule() {
  if (timer) clearTimeout(timer);
  timer = null;
  const at = nextWakeAt(useQueueStore.getState().jobs, currentUser());
  if (at === null) return;
  // Timers are not kept while the app is in the background; foreground calls kick() again.
  timer = setTimeout(kick, Math.max(250, at - Date.now()));
}

const touched = new Set<string>();

async function pump() {
  if (running) {
    again = true;
    return;
  }
  running = true;
  try {
    await ensureLoaded();
    do {
      again = false;
      for (;;) {
        const { online, jobs } = useQueueStore.getState();
        const user = currentUser();
        if (!online || !user) break;
        const job = nextRunnable(jobs, Date.now(), user);
        if (!job) break;
        await runOne(job);
      }
    } while (again);
  } finally {
    running = false;
    useQueueStore.setState({ activeId: null });
    schedule();
    // Inspection screens refetch what the server now holds (any query keyed with the inspection).
    for (const insp of touched) {
      void queryClient.invalidateQueries({ predicate: (q) => q.queryKey.includes(insp) });
    }
    touched.clear();
  }
}

async function runOne(job: UploadJob) {
  const step = stepOf(job);
  if (!step) {
    await put({ ...job, state: 'failed', lastErrorCode: 'INVALID_JOB', lastError: null, updatedAt: Date.now() });
    return;
  }
  if ((step.kind === 'upload' || step.kind === 'signature') && !fileExists(job.localPath)) {
    await put({ ...job, state: 'failed', lastErrorCode: 'FILE_MISSING', lastError: null, updatedAt: Date.now() });
    return;
  }
  useQueueStore.setState({ activeId: job.id });
  const result = await runStep(job, step);
  const next = advance(job, step.kind, result, Date.now());
  touched.add(job.inspectionUuid);
  if (next.state === 'done') await drop(next);
  else await put(next);
}

/** Runs the worker now (enqueue, retry, foreground, connection back). */
export function kick() {
  void pump();
}

/** Connection state changed. Back online: jobs waiting on the network run now. */
export function setOnline(online: boolean) {
  const was = useQueueStore.getState().online;
  useQueueStore.setState({ online });
  if (online && !was) wakeAll();
  else if (online) kick();
}

/** App back in the foreground: jobs waiting on the network run now. */
export function wakeAll() {
  const now = Date.now();
  for (const j of useQueueStore.getState().jobs) {
    const w = wake(j, now);
    if (w !== j) void put(w);
  }
  kick();
}

export { isPending };

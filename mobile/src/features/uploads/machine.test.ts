import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createAuthFetch } from '../../core/api/auth-fetch.ts';
import {
  advance,
  BACKOFF_BASE_MS,
  BACKOFF_CAP_MS,
  backoffDelay,
  countsOf,
  MAX_ATTEMPTS,
  nextRunnable,
  nextWakeAt,
  photoContentType,
  requestHeaders,
  retry,
  stepOf,
  type UploadJob,
  wake,
} from './machine.ts';

const USER = 'user-1';
const NOW = 1_000_000;
const half = () => 0; // jitter floor: 50 % of the exponential delay
const full = () => 0.999999;

function photo(over: Partial<UploadJob> = {}): UploadJob {
  return {
    id: 'job-1',
    userUuid: USER,
    orgSlug: 'acme',
    inspectionUuid: 'insp-1',
    kind: 'photo',
    localPath: 'file:///doc/uploads/job-1.jpg',
    meta: { slot: 'front', contentType: 'image/jpeg', sizeBytes: 1000, fileName: 'job-1.jpg' },
    state: 'queued',
    attempts: 0,
    networkRetries: 0,
    nextAttemptAt: 0,
    lastError: null,
    lastErrorCode: null,
    photoUuid: null,
    upload: null,
    seq: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

const UPLOAD = {
  method: 'PUT',
  path: '/v1/tenant/inspections/insp-1/photos/p-1/file',
  field: 'file',
  maxBytes: 15 << 20,
};

test('FIFO per inspection: only the oldest pending job of an inspection runs', () => {
  const a = photo({ id: 'a', seq: 1 });
  const b = photo({ id: 'b', seq: 2 });
  assert.equal(nextRunnable([b, a], NOW, USER)?.id, 'a');
  // A head that is backing off holds the jobs behind it.
  const waiting = { ...a, nextAttemptAt: NOW + 5000 };
  assert.equal(nextRunnable([b, waiting], NOW, USER), null);
  assert.equal(nextWakeAt([b, waiting], USER), NOW + 5000);
  // A failed job steps out of the line.
  assert.equal(nextRunnable([b, { ...a, state: 'failed' }], NOW, USER)?.id, 'b');
  // Done jobs are skipped.
  assert.equal(nextRunnable([b, { ...a, state: 'done' }], NOW, USER)?.id, 'b');
});

test('other inspections do not wait for a backing-off line', () => {
  const a = photo({ id: 'a', seq: 1, nextAttemptAt: NOW + 5000 });
  const c = photo({ id: 'c', seq: 3, inspectionUuid: 'insp-2' });
  assert.equal(nextRunnable([a, c], NOW, USER)?.id, 'c');
});

test('only the signed-in user sends their jobs', () => {
  const a = photo({ userUuid: 'someone-else' });
  assert.equal(nextRunnable([a], NOW, USER), null);
  assert.equal(nextRunnable([photo()], NOW, null), null);
});

test('backoff doubles from the base, is capped and jittered between 50 and 100 %', () => {
  assert.equal(backoffDelay(1, half), BACKOFF_BASE_MS / 2);
  assert.equal(backoffDelay(2, half), BACKOFF_BASE_MS);
  assert.equal(backoffDelay(3, half), BACKOFF_BASE_MS * 2);
  assert.equal(backoffDelay(4, full), Math.round(BACKOFF_BASE_MS * 8 * (0.5 + 0.5 * 0.999999)));
  assert.equal(backoffDelay(40, half), BACKOFF_CAP_MS / 2);
  assert.ok(backoffDelay(40, full) <= BACKOFF_CAP_MS);
  for (let n = 1; n < 12; n++) {
    const d = backoffDelay(n);
    const exp = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** (n - 1));
    assert.ok(d >= exp / 2 && d <= exp, `n=${n} d=${d}`);
  }
});

test('photo happy path: announce with client_ref, PUT to the API-issued path, complete', () => {
  let j = photo();
  const s1 = stepOf(j);
  assert.equal(s1?.kind, 'announce');
  assert.equal(s1?.path, '/v1/tenant/inspections/insp-1/photos');
  assert.equal((s1 as { body: Record<string, unknown> }).body.client_ref, 'job-1');

  j = advance(j, 'announce', { ok: true, photo: { uuid: 'p-1', status: 'pending' }, upload: UPLOAD }, NOW);
  assert.equal(j.state, 'announced');
  assert.deepEqual(stepOf(j), { kind: 'upload', method: 'PUT', path: UPLOAD.path, field: 'file' });

  j = advance(j, 'upload', { ok: true }, NOW);
  assert.equal(j.state, 'uploaded');
  assert.equal(stepOf(j)?.path, '/v1/tenant/inspections/insp-1/photos/p-1/complete');

  j = advance(j, 'complete', { ok: true }, NOW);
  assert.equal(j.state, 'done');
  assert.equal(stepOf(j), null);
});

test('ambiguous failure: the retry re-sends the same client_ref', () => {
  let j = photo();
  const first = stepOf(j) as { body: Record<string, unknown> };
  j = advance(j, 'announce', { ok: false, status: 0, code: 'NETWORK_ERROR' }, NOW, half);
  assert.equal(j.state, 'queued');
  assert.equal(j.attempts, 0, 'no answer does not count against the attempts');
  assert.equal(j.networkRetries, 1);
  assert.equal(j.nextAttemptAt, NOW + backoffDelay(1, half));
  const again = stepOf(j) as { body: Record<string, unknown> };
  assert.equal(again.body.client_ref, first.body.client_ref);
  assert.deepEqual(again.body, first.body);
  // The server deduped: it answers the photo the first try created, already uploaded.
  j = advance(j, 'announce', { ok: true, photo: { uuid: 'p-1', status: 'uploaded' }, upload: UPLOAD }, NOW + 5000);
  assert.equal(j.state, 'uploaded');
  assert.equal(j.networkRetries, 0);
});

test('already exists on the server → done', () => {
  // Announce answers a completed photo (the earlier try finished everything).
  let j = advance(photo(), 'announce', { ok: true, photo: { uuid: 'p-1', status: 'completed' }, upload: UPLOAD }, NOW);
  assert.equal(j.state, 'done');
  // PUT on a completed photo (409 INVALID_STATE / completed).
  j = photo({ state: 'announced', photoUuid: 'p-1', upload: UPLOAD });
  j = advance(j, 'upload', { ok: false, status: 409, code: 'INVALID_STATE', reason: 'completed' }, NOW);
  assert.equal(j.state, 'done');
  // Signature already bound to the contract approval by the earlier try.
  const sig = photo({
    kind: 'signature',
    meta: { signerName: 'Ayşe', strokes: { width: 1, height: 1, strokes: [] } },
  });
  assert.equal(
    advance(sig, 'signature', { ok: false, status: 409, code: 'INVALID_STATE', reason: 'signature_bound' }, NOW).state,
    'done',
  );
});

test('stored bytes missing → upload again', () => {
  const j = photo({ state: 'uploaded', photoUuid: 'p-1', upload: UPLOAD });
  const out = advance(
    j,
    'complete',
    { ok: false, status: 409, code: 'INVALID_STATE', reason: 'object_missing' },
    NOW,
    half,
  );
  assert.equal(out.state, 'announced');
  assert.equal(out.attempts, 1);
  assert.equal(stepOf({ ...out, nextAttemptAt: 0 })?.kind, 'upload');
});

test('server errors back off and fail after MAX_ATTEMPTS; manual retry re-announces', () => {
  let j = photo();
  for (let i = 1; i < MAX_ATTEMPTS; i++) {
    j = advance(j, 'announce', { ok: false, status: 503, code: 'STORAGE_UNAVAILABLE' }, NOW, half);
    assert.equal(j.state, 'queued');
    assert.equal(j.attempts, i);
    assert.equal(j.nextAttemptAt, NOW + backoffDelay(i, half));
  }
  j = advance(j, 'announce', { ok: false, status: 500, code: 'INTERNAL_ERROR', message: 'boom' }, NOW, half);
  assert.equal(j.state, 'failed');
  assert.equal(j.attempts, MAX_ATTEMPTS);
  assert.equal(j.lastErrorCode, 'INTERNAL_ERROR');
  assert.equal(nextRunnable([j], NOW + 10 ** 9, USER), null);

  const back = retry(j, NOW + 1);
  assert.equal(back.state, 'queued');
  assert.equal(back.attempts, 0);
  assert.equal(back.id, j.id, 'same client_ref');
  assert.equal(nextRunnable([back], NOW + 1, USER)?.id, j.id);
});

test('a failed job that had an upload address is announced again with the same client_ref', () => {
  const j = photo({ state: 'failed', photoUuid: 'p-1', upload: UPLOAD, attempts: MAX_ATTEMPTS });
  const back = retry(j, NOW);
  assert.equal(back.state, 'queued');
  assert.equal((stepOf(back) as { body: Record<string, unknown> }).body.client_ref, 'job-1');
});

test('validation, permission, finalized form and a missing record fail at once', () => {
  const j = photo();
  for (const r of [
    { status: 400, code: 'VALIDATION_ERROR' },
    { status: 403, code: 'FORBIDDEN' },
    { status: 403, code: 'NO_TENANT_MEMBERSHIP' },
    { status: 404, code: 'NOT_FOUND' },
    { status: 409, code: 'INVALID_STATE', reason: 'finalized' },
  ]) {
    assert.equal(advance(j, 'announce', { ok: false, ...r }, NOW).state, 'failed', JSON.stringify(r));
  }
  // A concurrent edit or a 401 the refresh could not fix is worth another try.
  assert.equal(advance(j, 'announce', { ok: false, status: 409, code: 'CONFLICT' }, NOW).state, 'queued');
  assert.equal(advance(j, 'announce', { ok: false, status: 401, code: 'UNAUTHORIZED' }, NOW).state, 'queued');
});

test('a file bigger than the API limit fails before uploading', () => {
  const j = photo({ meta: { slot: 'front', contentType: 'image/jpeg', sizeBytes: 20 << 20, fileName: 'x.jpg' } });
  const out = advance(j, 'announce', { ok: true, photo: { uuid: 'p-1', status: 'pending' }, upload: UPLOAD }, NOW);
  assert.equal(out.state, 'failed');
  assert.equal(out.lastErrorCode, 'TOO_LARGE');
});

test('wake runs network-waiting jobs now, keeps server backoff', () => {
  const net = photo({ networkRetries: 3, nextAttemptAt: NOW + 60_000 });
  assert.equal(wake(net, NOW).nextAttemptAt, NOW);
  const server = photo({ attempts: 3, nextAttemptAt: NOW + 60_000 });
  assert.equal(wake(server, NOW).nextAttemptAt, NOW + 60_000);
});

test('counts per inspection', () => {
  const jobs = [
    photo({ id: 'a' }),
    photo({ id: 'b', state: 'uploaded' }),
    photo({ id: 'c', state: 'failed' }),
    photo({ id: 'd', inspectionUuid: 'insp-2' }),
  ];
  assert.deepEqual(
    countsOf(jobs, (j) => j.inspectionUuid === 'insp-1'),
    { pending: 2, failed: 1 },
  );
});

test('signature step sends the strokes and the job organization', () => {
  const sig = photo({
    kind: 'signature',
    orgSlug: 'beta',
    meta: {
      signerName: 'Ayşe',
      signerRole: 'customer',
      strokes: { width: 300, height: 120, strokes: [[[1, 2, 0.5, 0]]] },
    },
  });
  const s = stepOf(sig);
  assert.equal(s?.kind, 'signature');
  assert.equal(s?.path, '/v1/tenant/inspections/insp-1/signature');
  assert.equal((s as { body: Record<string, unknown> }).body.signer_name, 'Ayşe');
  assert.deepEqual(requestHeaders(sig), { 'X-Organization': 'beta' });
});

test('the API client keeps the job organization instead of the one picked in the UI', async () => {
  const sent: Request[] = [];
  const { authFetch } = createAuthFetch({
    apiUrl: 'https://api.test',
    fetch: async (r) => {
      sent.push(r);
      return new Response('{}', { status: 200 });
    },
    getTokens: () => ({ access: 'a', refresh: 'r', accessExpiresAt: Date.now() + 3_600_000 }),
    saveTokens: async () => {},
    getOrganization: () => 'picked-now',
    headers: () => ({}),
    onSessionExpired: () => {},
  });
  const job = photo({ orgSlug: 'captured-in' });
  await authFetch(
    new Request('https://api.test/v1/tenant/inspections/insp-1/photos', {
      method: 'POST',
      headers: requestHeaders(job),
    }),
  );
  await authFetch(new Request('https://api.test/v1/tenant/context'));
  assert.equal(sent[0].headers.get('X-Organization'), 'captured-in');
  assert.equal(sent[1].headers.get('X-Organization'), 'picked-now');
});

test('photoContentType prefers an accepted mime type, else the extension', () => {
  assert.equal(photoContentType('file:///a/b.HEIC'), 'image/heic');
  assert.equal(photoContentType('file:///a/b.jpg', 'image/jpeg'), 'image/jpeg');
  assert.equal(photoContentType('file:///a/b', 'image/png'), 'image/png');
  assert.equal(photoContentType('file:///a/b.pdf', 'application/pdf'), null);
});

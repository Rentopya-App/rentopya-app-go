import assert from 'node:assert/strict';
import { test } from 'node:test';

import { inspection, READY } from './fixtures.test-util.ts';
import {
  boundStep,
  checkKm,
  clampFuel,
  completeGate,
  completePayload,
  damagePayload,
  delta,
  htmlToText,
  kmDigits,
  missingNow,
  newDamageDraft,
  photoSlots,
  restPresent,
  signatureReady,
  stepState,
  stepsOf,
  toggleItem,
  type Inspection,
} from './model.ts';

const gateInput = { queuePending: 0, noSignatureReason: '', contractReason: '', canWaiveSignature: false };
const signature = {
  uuid: 's1',
  signer_name: 'Ayşe',
  signer_role: 'customer',
  sha256: 'ab',
  size_bytes: 10,
  point_count: 40,
  signed_at: '2026-11-09T09:00:00Z',
  device_signed_at: null,
  contract_approval: null,
} as unknown as NonNullable<Inspection['signature']>;

test('steps follow the panel and a remembered step is bounded', () => {
  assert.deepEqual(stepsOf('handover'), [
    'verify',
    'amounts',
    'readings',
    'damages',
    'photos',
    'review',
    'signature',
    'complete',
  ]);
  assert.equal(stepsOf('return')[4], 'charges');
  assert.equal(boundStep(3, 'handover'), 3);
  assert.equal(boundStep(42, 'return'), 7);
  assert.equal(boundStep(-1, 'return'), 0);
  assert.equal(boundStep('x', 'return'), 0);
  assert.equal(boundStep(1.5, 'return'), 0);
});

test('km: digits only, empty is unanswered, below the handover is flagged', () => {
  assert.equal(kmDigits('12.345 km'), '12345');
  assert.deepEqual(checkKm(''), { value: null, problem: null });
  assert.deepEqual(checkKm('12a'), { value: null, problem: 'invalid' });
  assert.deepEqual(checkKm('15000'), { value: 15000, problem: null });
  assert.deepEqual(checkKm('14999', 15000), { value: 14999, problem: 'below_handover' });
  assert.deepEqual(checkKm('15000', 15000), { value: 15000, problem: null });
});

test('fuel snaps to the slider steps and deltas need both values', () => {
  assert.equal(clampFuel(47), 45);
  assert.equal(clampFuel(48), 50);
  assert.equal(clampFuel(-3), 0);
  assert.equal(clampFuel(130), 100);
  assert.equal(clampFuel(Number.NaN), 0);
  assert.equal(delta(15420, 15000), 420);
  assert.equal(delta(null, 15000), null);
});

test('equipment: toggling, rest present, missing now against the handover', () => {
  assert.equal(toggleItem(undefined), true);
  assert.equal(toggleItem(true), false);
  assert.equal(toggleItem(false), true);
  const checklist = inspection().template.checklist;
  assert.deepEqual(restPresent(checklist, { jack: false }), { spare: true });
  assert.deepEqual(
    missingNow(checklist, { jack: false, spare: false }, { jack: true, spare: false }).map((i) => i.key),
    ['jack'],
  );
});

test('damage payload: return flags only on a return, position only when tapped', () => {
  const h = newDamageDraft('handover', 'hood', { pos_x: 0.5, pos_y: 0.2 });
  assert.equal(h.is_new, false);
  assert.deepEqual(damagePayload({ ...h, description: '  çizik ', is_new: true, disputed: true }, 'handover'), {
    zone: 'hood',
    damage_type: 'scratch',
    severity: 'minor',
    description: 'çizik',
    is_new: false,
    disputed: false,
    pos_x: 0.5,
    pos_y: 0.2,
  });
  const r = newDamageDraft('return', 'interior');
  assert.equal(r.is_new, true);
  const body = damagePayload({ ...r, disputed: true, severity: 'major', damage_type: 'stain' }, 'return');
  assert.equal(body.disputed, true);
  assert.equal('pos_x' in body, false);
});

test('photo slots add the free extra slot', () => {
  assert.deepEqual(
    photoSlots(inspection(), 'Ek').map((s) => s.key),
    ['front', 'rear', 'extra'],
  );
});

test('signature needs 8 points and a name', () => {
  assert.equal(signatureReady(7, 'Ayşe'), false);
  assert.equal(signatureReady(8, 'A'), false);
  assert.equal(signatureReady(8, ' Ay '), true);
});

test('completion gate mirrors the panel (RT-A17)', () => {
  const draft = inspection();
  assert.equal(completeGate(draft, gateInput).canComplete, false);

  const ready = inspection({ readiness: READY });
  // Unsigned handover: reason and signature.waive.
  let g = completeGate(ready, { ...gateInput, noSignatureReason: 'yok' });
  assert.equal(g.reasonOk, true);
  assert.equal(g.permOk, false);
  assert.equal(g.canComplete, false);
  g = completeGate(ready, { ...gateInput, noSignatureReason: 'yok', canWaiveSignature: true });
  assert.equal(g.canComplete, true);
  // The device queue holds back the button but not the rest.
  g = completeGate(ready, { ...gateInput, noSignatureReason: 'yok', canWaiveSignature: true, queuePending: 2 });
  assert.equal(g.readyButQueue, true);
  assert.equal(g.canComplete, false);
  assert.equal(g.uploadsOk, false);
  // Unsigned return: a reason, no waive permission.
  const ret = inspection({ kind: 'return', readiness: READY });
  assert.equal(completeGate(ret, { ...gateInput, noSignatureReason: 'imzalamadı' }).canComplete, true);
  // Signed.
  const signed = inspection({ readiness: { ...READY, missing_fields: [] }, signature });
  assert.equal(completeGate(signed, gateInput).canComplete, true);
  // A field other than the signature blocks.
  const km = inspection({ signature, readiness: { ...READY, missing_fields: ['km'] } });
  assert.equal(completeGate(km, gateInput).fieldsOk, false);
});

test('an unapproved contract needs the signature approval or a waiver reason', () => {
  const rental = { ...inspection().rental, contract: { required: true, approved: false, document_uuid: 'doc1' } };
  const ins = inspection({ rental, signature, readiness: { ...READY, missing_fields: [] } });
  let g = completeGate(ins, gateInput);
  assert.equal(g.needsContractWaiver, true);
  assert.equal(g.canComplete, false);
  g = completeGate(ins, { ...gateInput, contractReason: 'müşteri sonra onaylayacak' });
  assert.equal(g.canComplete, true);
  const approved = inspection({
    rental,
    signature: { ...signature, contract_approval: {} as never },
    readiness: { ...READY, missing_fields: [] },
  });
  assert.equal(completeGate(approved, gateInput).canComplete, true);
  // A return never needs it.
  assert.equal(completeGate(inspection({ ...ins, kind: 'return' }), gateInput).needsContractWaiver, false);
});

test('complete payload leaves out empty reasons', () => {
  assert.deepEqual(completePayload({ signature: null }, '  ', ''), {});
  assert.deepEqual(completePayload({ signature: null }, ' imza yok ', ' x '), {
    no_signature_reason: 'imza yok',
    contract_waiver_reason: 'x',
  });
  assert.deepEqual(completePayload({ signature }, 'ignored', ''), {});
});

test('step dots', () => {
  const ins = inspection({
    verification: {
      plate_confirmed: true,
      vehicle_ok: true,
      driver_uuid: null,
      identity_checked: true,
      licence_checked: false,
    },
  });
  assert.equal(stepState('verify', ins), 'todo');
  assert.equal(stepState('verify', { ...ins, kind: 'return' }), 'done');
  assert.equal(stepState('readings', { ...ins, km: 1, fuel: 50, equipment: { jack: false } }), 'done');
  assert.equal(stepState('readings', { ...ins, km: 1, fuel: 50 }), 'todo');
  assert.equal(stepState('photos', inspection({ readiness: READY })), 'done');
  assert.equal(stepState('amounts', ins), 'done');
});

test('contract HTML becomes readable text', () => {
  const html =
    '<html><head><style>p{}</style></head><body><h1>Sözleşme</h1><p>Kiracı:&nbsp;Ayşe &amp; Ali &middot; 3&times;</p><ul><li>Bir</li><li>İki</li></ul><script>x()</script>Son&#39;</body></html>';
  assert.equal(htmlToText(html), "Sözleşme\nKiracı: Ayşe & Ali · 3×\n• Bir\n• İki\nSon'");
});

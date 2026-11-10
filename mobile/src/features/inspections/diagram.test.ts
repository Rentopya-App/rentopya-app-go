import assert from 'node:assert/strict';
import { test } from 'node:test';

import { countByZone, markerPoint, SHAPES, shapeCenter, toPosition, viewPoint, zoneAt, ZONES } from './diagram.ts';

test('every drawn shape is a known zone and only interior has no shape', () => {
  for (const s of SHAPES) assert.ok(ZONES.includes(s.zone));
  const drawn = new Set(SHAPES.map((s) => s.zone));
  assert.deepEqual(
    ZONES.filter((z) => !drawn.has(z)),
    ['interior'],
  );
});

test('the centre of every shape hits its own zone', () => {
  for (const s of SHAPES) {
    const [x, y] = shapeCenter(s);
    assert.equal(zoneAt(x, y), s.zone, s.zone);
  }
});

test('near misses snap to the closest small panel, empty space is null', () => {
  assert.equal(zoneAt(13, 72), 'left_front_wheel'); // just outside the 7-unit wheel
  assert.equal(zoneAt(100, 1), 'front_bumper');
  assert.equal(zoneAt(4, 360), null);
});

test('a tap in the drawn box maps to the viewBox and to the API position', () => {
  const [x, y] = viewPoint(130, 266, 260, 494);
  assert.equal(Math.round(x), 100);
  assert.equal(Math.round(y), 205);
  assert.equal(zoneAt(x, y), 'roof');
  assert.deepEqual(toPosition(x, y), { pos_x: 0.5, pos_y: 0.5385 });
  assert.deepEqual(toPosition(-5, 999), { pos_x: 0, pos_y: 1 });
});

test('markers round-trip; web damages without a position sit at the zone centre', () => {
  const pos = toPosition(150, 120);
  const [x, y] = markerPoint({ zone: 'right_front_door', ...pos });
  assert.ok(Math.abs(x - 150) < 0.05 && Math.abs(y - 120) < 0.05);
  assert.deepEqual(markerPoint({ zone: 'hood', pos_x: null, pos_y: null }), [100, 71]);
  assert.deepEqual(markerPoint({ zone: 'interior', pos_x: null, pos_y: null }), [100, 201]);
  assert.deepEqual(countByZone([{ zone: 'hood' }, { zone: 'hood' }, { zone: 'roof' }]), { hood: 2, roof: 1 });
});

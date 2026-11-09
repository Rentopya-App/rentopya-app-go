/**
 * The vehicle diagram of the panel (`frontend/src/features/inspections/
 * components/vehicle-diagram.tsx`): the same top view (front up), the same
 * 200 × 380 viewBox and the same zone shapes, so a damage marked on the phone
 * lands on the same panel in the web and the other way round. A marker is
 * stored as `pos_x` / `pos_y` (0-1 of the viewBox); the web stores none and
 * its damages are drawn at the zone's centre.
 */

export const VIEW_W = 200;
export const VIEW_H = 380;

/** Zones of the diagram (the API refuses anything else). */
export const ZONES = [
  'front_bumper',
  'hood',
  'windshield',
  'roof',
  'rear_window',
  'trunk',
  'rear_bumper',
  'left_front_fender',
  'left_front_door',
  'left_rear_door',
  'left_rear_fender',
  'left_mirror',
  'right_front_fender',
  'right_front_door',
  'right_rear_door',
  'right_rear_fender',
  'right_mirror',
  'left_front_wheel',
  'left_rear_wheel',
  'right_front_wheel',
  'right_rear_wheel',
  'interior',
] as const;

export type Zone = (typeof ZONES)[number];

export type Shape =
  | { zone: Zone; kind: 'rect'; x: number; y: number; w: number; h: number; r?: number }
  | { zone: Zone; kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number };

/** Copied from the panel's `SHAPES` (keep in sync). */
export const SHAPES: readonly Shape[] = [
  { zone: 'front_bumper', kind: 'rect', x: 40, y: 6, w: 120, h: 22, r: 10 },
  { zone: 'hood', kind: 'rect', x: 55, y: 30, w: 90, h: 82, r: 6 },
  { zone: 'windshield', kind: 'rect', x: 58, y: 114, w: 84, h: 30, r: 6 },
  { zone: 'roof', kind: 'rect', x: 58, y: 146, w: 84, h: 110, r: 4 },
  { zone: 'rear_window', kind: 'rect', x: 58, y: 258, w: 84, h: 28, r: 6 },
  { zone: 'trunk', kind: 'rect', x: 55, y: 288, w: 90, h: 62, r: 6 },
  { zone: 'rear_bumper', kind: 'rect', x: 40, y: 352, w: 120, h: 22, r: 10 },
  { zone: 'left_front_fender', kind: 'rect', x: 30, y: 30, w: 23, h: 82, r: 6 },
  { zone: 'left_front_door', kind: 'rect', x: 30, y: 114, w: 23, h: 84 },
  { zone: 'left_rear_door', kind: 'rect', x: 30, y: 200, w: 23, h: 78 },
  { zone: 'left_rear_fender', kind: 'rect', x: 30, y: 280, w: 23, h: 70, r: 6 },
  { zone: 'right_front_fender', kind: 'rect', x: 147, y: 30, w: 23, h: 82, r: 6 },
  { zone: 'right_front_door', kind: 'rect', x: 147, y: 114, w: 23, h: 84 },
  { zone: 'right_rear_door', kind: 'rect', x: 147, y: 200, w: 23, h: 78 },
  { zone: 'right_rear_fender', kind: 'rect', x: 147, y: 280, w: 23, h: 70, r: 6 },
  { zone: 'left_mirror', kind: 'rect', x: 10, y: 120, w: 18, h: 14, r: 4 },
  { zone: 'right_mirror', kind: 'rect', x: 172, y: 120, w: 18, h: 14, r: 4 },
  { zone: 'left_front_wheel', kind: 'ellipse', cx: 22, cy: 72, rx: 7, ry: 22 },
  { zone: 'right_front_wheel', kind: 'ellipse', cx: 178, cy: 72, rx: 7, ry: 22 },
  { zone: 'left_rear_wheel', kind: 'ellipse', cx: 22, cy: 312, rx: 7, ry: 22 },
  { zone: 'right_rear_wheel', kind: 'ellipse', cx: 178, cy: 312, rx: 7, ry: 22 },
];

export function isZone(v: string): v is Zone {
  return (ZONES as readonly string[]).includes(v);
}

export function shapeCenter(s: Shape): [number, number] {
  return s.kind === 'rect' ? [s.x + s.w / 2, s.y + s.h / 2] : [s.cx, s.cy];
}

function inside(s: Shape, x: number, y: number, slop: number) {
  if (s.kind === 'rect') return x >= s.x - slop && x <= s.x + s.w + slop && y >= s.y - slop && y <= s.y + s.h + slop;
  const dx = (x - s.cx) / (s.rx + slop);
  const dy = (y - s.cy) / (s.ry + slop);
  return dx * dx + dy * dy <= 1;
}

function distance(s: Shape, x: number, y: number) {
  const [cx, cy] = shapeCenter(s);
  return Math.hypot(x - cx, y - cy);
}

/**
 * The zone under a tap (viewBox coordinates). An exact hit wins; otherwise
 * the nearest shape within `slop` units (fingers are wider than the 7-unit
 * mirrors and wheels). Null when the tap is on empty space.
 */
export function zoneAt(x: number, y: number, slop = 6): Zone | null {
  const exact = SHAPES.filter((s) => inside(s, x, y, 0));
  // Mirrors and wheels sit on top of the body panels: the smallest hit wins.
  const pick = (list: Shape[]) =>
    [...list].sort((a, b) => area(a) - area(b) || distance(a, x, y) - distance(b, x, y))[0];
  if (exact.length) return pick(exact).zone;
  const near = SHAPES.filter((s) => inside(s, x, y, slop));
  return near.length ? pick(near).zone : null;
}

function area(s: Shape) {
  return s.kind === 'rect' ? s.w * s.h : Math.PI * s.rx * s.ry;
}

/** Tap in the drawn view (px of a `width` × `height` box) → viewBox units. */
export function viewPoint(px: number, py: number, width: number, height: number): [number, number] {
  if (width <= 0 || height <= 0) return [0, 0];
  return [(px / width) * VIEW_W, (py / height) * VIEW_H];
}

const round4 = (v: number) => Math.round(v * 1e4) / 1e4;

/** viewBox point → the API's marker position (0-1, four decimals; the API keeps 1e-4). */
export function toPosition(x: number, y: number): { pos_x: number; pos_y: number } {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return { pos_x: round4(clamp(x / VIEW_W)), pos_y: round4(clamp(y / VIEW_H)) };
}

/**
 * Where a damage is drawn: its stored marker, else its zone's centre (web
 * damages and `interior` have no marker; interior is drawn on the roof).
 */
export function markerPoint(d: { zone: string; pos_x: number | null; pos_y: number | null }): [number, number] {
  if (d.pos_x != null && d.pos_y != null) return [d.pos_x * VIEW_W, d.pos_y * VIEW_H];
  const shape = SHAPES.find((s) => s.zone === d.zone) ?? SHAPES.find((s) => s.zone === 'roof');
  return shape ? shapeCenter(shape) : [VIEW_W / 2, VIEW_H / 2];
}

/** Damages per zone (the badge count of a panel). */
export function countByZone(damages: { zone: string }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of damages) out[d.zone] = (out[d.zone] ?? 0) + 1;
  return out;
}

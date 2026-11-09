import assert from "node:assert/strict";
import { test } from "node:test";

import { MEDIA_HEADERS, safeImageType } from "./media-type.ts";

test("raster images pass, normalised", () => {
  assert.equal(safeImageType("image/png"), "image/png");
  assert.equal(safeImageType("Image/JPEG; charset=binary"), "image/jpeg");
  assert.equal(safeImageType("image/webp"), "image/webp");
});

test("active or unknown types are refused", () => {
  assert.equal(safeImageType("image/svg+xml"), "");
  assert.equal(safeImageType("text/html"), "");
  assert.equal(safeImageType("image/x-icon"), "");
  assert.equal(safeImageType(""), "");
  assert.equal(safeImageType(null), "");
});

test("media responses are sandboxed", () => {
  assert.match(MEDIA_HEADERS["Content-Security-Policy"], /sandbox/);
  assert.equal(MEDIA_HEADERS["X-Content-Type-Options"], "nosniff");
});

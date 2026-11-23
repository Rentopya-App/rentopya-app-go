import assert from "node:assert/strict";
import { test } from "node:test";

import { needsBookingSession } from "./session.ts";

test("only booking pages mint a visitor session at render (TEC-1280)", () => {
  for (const path of ["/search", "/book/q-1", "/reservation/ABC-1", "/search/"])
    assert.equal(needsBookingSession(path, "GET"), true, path);
  for (const path of [
    "/",
    "/vehicles",
    "/campaigns",
    "/guide/x",
    "/searching",
    "/lookup",
    "/bookmarks",
  ])
    assert.equal(needsBookingSession(path, "GET"), false, path);
  // Server actions post to the page they run on and mint on their own.
  assert.equal(needsBookingSession("/search", "POST"), false);
});

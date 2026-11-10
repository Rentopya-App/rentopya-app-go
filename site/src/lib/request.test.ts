import assert from "node:assert/strict";
import { test } from "node:test";

import { forwardedForFrom } from "./request.ts";

const h = (init: Record<string, string>) => new Headers(init);

test("forwardedForFrom forwards the whole chain, not a client-picked hop", () => {
  assert.equal(
    forwardedForFrom(h({ "x-forwarded-for": "6.6.6.6, 198.51.100.7" })),
    "6.6.6.6, 198.51.100.7",
  );
});

test("forwardedForFrom ignores X-Real-IP when a chain is present", () => {
  assert.equal(
    forwardedForFrom(
      h({ "x-forwarded-for": "198.51.100.7", "x-real-ip": "1.2.3.4" }),
    ),
    "198.51.100.7",
  );
});

test("forwardedForFrom falls back to X-Real-IP and drops malformed hops", () => {
  assert.equal(
    forwardedForFrom(h({ "x-real-ip": "198.51.100.7" })),
    "198.51.100.7",
  );
  assert.equal(
    forwardedForFrom(h({ "x-forwarded-for": "not-an-ip, , 2001:db8::1" })),
    "2001:db8::1",
  );
  assert.equal(forwardedForFrom(h({})), "");
});

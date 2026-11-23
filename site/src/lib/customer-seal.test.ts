import assert from "node:assert/strict";
import { test } from "node:test";

import {
  accountNext,
  maskContact,
  openPending,
  sealPending,
  type PendingSignIn,
} from "./customer-seal.ts";

const secret = "s".repeat(40);
const now = Date.UTC(2026, 10, 23, 12, 0, 0);
const state: PendingSignIn = {
  origin: "https://acme.rentopya.app",
  contact: "0532 111 22 33",
  channel: "sms",
  resendAt: now / 1000 + 60,
  expires: now / 1000 + 600,
  next: "/account",
};

test("seals the pending sign-in and opens it on the same origin only", () => {
  const sealed = sealPending(state, secret);
  assert.doesNotMatch(sealed, /0532|111/);
  assert.deepEqual(openPending(sealed, state.origin, secret, now), state);
  assert.equal(openPending(sealed, "https://other.test", secret, now), null);
  assert.equal(openPending(sealed, state.origin, "x".repeat(40), now), null);
  assert.equal(
    openPending(sealed.slice(0, -2) + "AA", state.origin, secret, now),
    null,
  );
});

test("expires", () => {
  const sealed = sealPending(state, secret);
  assert.equal(openPending(sealed, state.origin, secret, now + 601_000), null);
  const tooLong = sealPending({ ...state, expires: now / 1000 + 3600 }, secret);
  assert.equal(openPending(tooLong, state.origin, secret, now), null);
});

test("masks contacts", () => {
  assert.equal(maskContact("0532 111 22 33"), "0532 *** ** 33");
  assert.equal(maskContact("ayse@example.test"), "a***@example.test");
});

test("opens only account pages after sign-in", () => {
  assert.equal(accountNext("/account"), "/account");
  assert.equal(
    accountNext("/account/0b6f1f2e-7a5d-4c1b-9a3e-2b1c0d9e8f7a"),
    "/account/0b6f1f2e-7a5d-4c1b-9a3e-2b1c0d9e8f7a",
  );
  for (const bad of [
    "https://evil.test",
    "//evil.test",
    "/vehicles",
    "/account/../x",
    "",
  ])
    assert.equal(accountNext(bad), "/account");
});

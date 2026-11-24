import assert from "node:assert/strict";
import { test } from "node:test";

import {
  landing,
  openReturn,
  payLinkToken,
  returnURL,
  safeCheckoutURL,
  sealReturn,
} from "./payment-return.ts";

const SECRET = "x".repeat(40);
const ORIGIN = "https://ides.rentopya.app";
const TOKEN = "AbCdEfGhIjKlMnOpQrStUv";

test("return state round trip, bound to origin and token", () => {
  const url = returnURL(
    { origin: ORIGIN, token: TOKEN, to: "/reservation/IDS-2026-000005" },
    SECRET,
  );
  assert.ok(url);
  const u = new URL(url);
  assert.equal(u.origin, ORIGIN);
  assert.equal(u.pathname, `/payment/${TOKEN}/return`);
  const s = u.searchParams.get("s");
  const state = openReturn(s, ORIGIN, TOKEN, SECRET);
  assert.equal(state?.to, "/reservation/IDS-2026-000005");
  assert.equal(
    openReturn(s, "https://other.rentopya.app", TOKEN, SECRET),
    null,
  );
  assert.equal(openReturn(s, ORIGIN, "OtherTokenOtherToken12", SECRET), null);
  assert.equal(openReturn(s, ORIGIN, TOKEN, "y".repeat(40)), null);
  assert.equal(
    openReturn(s, ORIGIN, TOKEN, SECRET, Date.now() + 4 * 3600_000),
    null,
  );
});

test("only reservation and account pages are destinations", () => {
  for (const to of [
    "https://evil.example",
    "//evil.example",
    "/login",
    "/account/x",
  ])
    assert.equal(returnURL({ origin: ORIGIN, token: TOKEN, to }, SECRET), null);
  const forged = sealReturn(
    {
      origin: ORIGIN,
      token: TOKEN,
      to: "//evil.example",
      expires: Math.floor(Date.now() / 1000) + 60,
    },
    SECRET,
  );
  assert.equal(openReturn(forged, ORIGIN, TOKEN, SECRET), null);
});

test("landing carries the payment token and the embed state", () => {
  const state = {
    origin: ORIGIN,
    token: TOKEN,
    to: "/reservation/ABC-1",
    embed: "e1.abc",
    expires: 0,
  };
  assert.equal(landing(state), `/reservation/ABC-1?payment=${TOKEN}&s=e1.abc`);
});

test("pay link token and provider URL checks", () => {
  assert.equal(payLinkToken(`https://rentopya.app/pay/${TOKEN}`), TOKEN);
  assert.equal(payLinkToken(`https://rentopya.app/pay/${TOKEN}/widget`), null);
  assert.equal(payLinkToken("nope"), null);
  assert.equal(
    safeCheckoutURL("https://sandbox-cpp.iyzipay.com?token=1&lang=tr"),
    "https://sandbox-cpp.iyzipay.com/?token=1&lang=tr",
  );
  assert.equal(safeCheckoutURL("javascript:alert(1)"), null);
  assert.equal(safeCheckoutURL("http://cpp.iyzipay.com"), null);
});

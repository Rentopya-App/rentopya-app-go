import assert from "node:assert/strict";
import { test } from "node:test";

import {
  authUrlIsHttps,
  sessionCookieName,
  usesSecureCookies,
} from "./auth-cookie.ts";

test("session cookie follows the AUTH_URL scheme, not NODE_ENV", () => {
  // Production build served on plain HTTP: no __Secure- prefix.
  const plainProd = {
    NODE_ENV: "production",
    AUTH_URL: "http://panel.example.test",
  };
  assert.equal(usesSecureCookies(plainProd), false);
  assert.equal(sessionCookieName(plainProd), "authjs.session-token");

  // Development build behind https: prefixed.
  const httpsDev = { NODE_ENV: "development", AUTH_URL: "https://localhost" };
  assert.equal(usesSecureCookies(httpsDev), true);
  assert.equal(sessionCookieName(httpsDev), "__Secure-authjs.session-token");
});

test("legacy NEXTAUTH_URL is honoured when AUTH_URL is missing", () => {
  const env = { NODE_ENV: "production", NEXTAUTH_URL: "http://10.0.0.5:3000" };
  assert.equal(sessionCookieName(env), "authjs.session-token");
  assert.equal(authUrlIsHttps(env), false);
});

test("without AUTH_URL, production means secure", () => {
  assert.equal(
    sessionCookieName({ NODE_ENV: "production" }),
    "__Secure-authjs.session-token",
  );
  assert.equal(
    sessionCookieName({ NODE_ENV: "development", AUTH_URL: "  " }),
    "authjs.session-token",
  );
  assert.equal(authUrlIsHttps({ NODE_ENV: "production" }), false);
});

test("scheme check is case-insensitive", () => {
  assert.equal(usesSecureCookies({ AUTH_URL: "HTTPS://Panel.Example" }), true);
});

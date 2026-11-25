import assert from "node:assert/strict";
import { test } from "node:test";

import { newNonce, sentryReportUri, sitePolicy, withNonce } from "./csp.ts";

test("script policy: nonce + strict-dynamic, no inline script, no objects", () => {
  const p = sitePolicy({ nonce: "abc" });
  assert.match(p, /script-src 'self' 'nonce-abc' 'strict-dynamic'(;|$)/);
  assert.doesNotMatch(p, /script-src[^;]*unsafe-inline/);
  assert.doesNotMatch(p, /unsafe-eval/);
  assert.match(p, /object-src 'none'/);
  assert.match(p, /default-src 'self'/);
  assert.doesNotMatch(p, /googletagmanager|report-uri/);
});

test("GA4 and the report endpoint are added only when set", () => {
  const p = sitePolicy({
    nonce: "n",
    ga4: "G-ABC123",
    reportUri: "https://o1.ingest.sentry.io/api/2/security/?sentry_key=k",
  });
  assert.match(p, /script-src [^;]*https:\/\/www\.googletagmanager\.com/);
  assert.match(p, /connect-src [^;]*https:\/\/\*\.google-analytics\.com/);
  assert.match(
    p,
    /report-uri https:\/\/o1\.ingest\.sentry\.io\/api\/2\/security\//,
  );
  assert.match(sitePolicy({ nonce: "n", dev: true }), /'unsafe-eval'/);
});

test("Sentry security endpoint from a DSN", () => {
  assert.equal(
    sentryReportUri(
      "https://key123@o1.ingest.sentry.io/42",
      "production",
      "v1",
    ),
    "https://o1.ingest.sentry.io/api/42/security/?sentry_key=key123&sentry_environment=production&sentry_release=v1",
  );
  assert.equal(sentryReportUri(undefined), "");
  assert.equal(sentryReportUri("not a dsn"), "");
  assert.equal(sentryReportUri("http://k@host/1"), "");
});

test("nonces are fresh and base64", () => {
  const a = newNonce();
  assert.match(a, /^[A-Za-z0-9+/]{22}==$/);
  assert.notEqual(a, newNonce());
});

test("the enforced framing policy carries the nonce where Next reads it", () => {
  const p = withNonce("frame-ancestors 'none'; base-uri 'self';", "abc");
  assert.equal(
    p,
    "frame-ancestors 'none'; base-uri 'self'; script-src-attr 'nonce-abc'",
  );
  // Next takes the first directive starting with script-src.
  const directive = p
    .split(";")
    .map((d) => d.trim())
    .find((d) => d.startsWith("script-src"));
  assert.equal(directive, "script-src-attr 'nonce-abc'");
});

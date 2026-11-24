import assert from "node:assert/strict";
import { test } from "node:test";

import { baseHost, hostAllowed, Lru } from "./resolve.ts";

test("only hosts that can name a site reach the API", () => {
  const base = "rentopya.app";
  assert.equal(hostAllowed("ides.rentopya.app", base), true);
  assert.equal(hostAllowed("idescarrental.com.tr", base), true);
  assert.equal(hostAllowed("www.example.com", base), true);
  assert.equal(hostAllowed("rentopya.app", base), false);
  assert.equal(hostAllowed("a.b.rentopya.app", base), false);
  assert.equal(hostAllowed("-x.rentopya.app", base), false);
  assert.equal(hostAllowed(`${"a".repeat(64)}.rentopya.app`, base), false);
  assert.equal(hostAllowed("10.0.0.1", base), false);
  assert.equal(hostAllowed("localhost", base), false);
  assert.equal(hostAllowed("example.com:8443", base), false);
  assert.equal(hostAllowed("", base), false);
  // Without SITE_BASE_URL nothing is filtered (development).
  assert.equal(hostAllowed("acme.localhost:3100", ""), true);
  assert.equal(
    hostAllowed("acme.localhost:3100", baseHost("http://localhost:3100")),
    true,
  );
  assert.equal(baseHost("not a url"), "");
});

test("LRU keeps recently used entries and expires old ones", () => {
  const lru = new Lru<number>(2);
  lru.set("a", 1, 1000, 0);
  lru.set("b", 2, 1000, 0);
  assert.equal(lru.get("a", 10), 1); // a is now the most recent
  lru.set("c", 3, 1000, 20); // evicts b, not a
  assert.equal(lru.get("b", 30), undefined);
  assert.equal(lru.get("a", 30), 1);
  assert.equal(lru.get("c", 30), 3);
  assert.equal(lru.get("a", 2000), undefined);
  assert.equal(lru.size, 1);
});

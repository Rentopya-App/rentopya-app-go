import assert from "node:assert/strict";
import { test } from "node:test";

import { createTtlCache } from "./ttl-cache.ts";

test("serves a value until it expires and shares concurrent loads", async () => {
  let t = 0;
  let loads = 0;
  const cache = createTtlCache<number>(1000, 10, () => t);
  const load = async () => ++loads;
  const [a, b] = await Promise.all([
    cache.get("k", load),
    cache.get("k", load),
  ]);
  assert.equal(a, 1);
  assert.equal(b, 1);
  t = 999;
  assert.equal(await cache.get("k", load), 1);
  t = 1000;
  assert.equal(await cache.get("k", load), 2);
});

test("drops failed loads so the next caller retries", async () => {
  const cache = createTtlCache<string>(1000, 10, () => 0);
  await assert.rejects(cache.get("k", () => Promise.reject(new Error("down"))));
  assert.equal(cache.size(), 0);
  assert.equal(await cache.get("k", async () => "ok"), "ok");
});

test("evicts the least recently used entry", async () => {
  const cache = createTtlCache<string>(60_000, 2, () => 0);
  await cache.get("a", async () => "a");
  await cache.get("b", async () => "b");
  await cache.get("a", async () => "a2"); // hit: a becomes most recent
  await cache.get("c", async () => "c"); // evicts b
  assert.equal(await cache.get("a", async () => "reloaded"), "a");
  assert.equal(await cache.get("b", async () => "reloaded"), "reloaded");
});

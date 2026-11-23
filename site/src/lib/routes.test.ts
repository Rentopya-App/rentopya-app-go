import assert from "node:assert/strict";
import { test } from "node:test";

import { ROUTES, alternates, localizePath, resolvePath } from "./routes.ts";

test("localizes internal paths with query and hash", () => {
  assert.equal(localizePath("/vehicles", "tr"), "/araclar");
  assert.equal(localizePath("/vehicles", "en"), "/vehicles");
  assert.equal(
    localizePath("/branches/1b2c?x=1#map", "tr"),
    "/subeler/1b2c?x=1#map",
  );
  assert.equal(
    localizePath("/login?next=/account", "tr"),
    "/giris?next=/account",
  );
  assert.equal(localizePath("/araclar", "en"), "/vehicles");
});

test("leaves neutral and foreign paths alone", () => {
  for (const p of [
    "/",
    "/embed?s=1",
    "/media/x",
    "/lang?l=en",
    "https://x.test/vehicles",
    "//evil.test/vehicles",
    "/vehiclesx",
  ])
    assert.equal(localizePath(p, "tr"), p);
});

test("resolves both languages to the internal path", () => {
  assert.deepEqual(resolvePath("/araclar"), {
    path: "/vehicles",
    locale: "tr",
  });
  assert.deepEqual(resolvePath("/giris"), { path: "/login", locale: "tr" });
  assert.deepEqual(resolvePath("/login"), { path: "/login", locale: "en" });
  assert.deepEqual(resolvePath("/rezervasyon/ABC-1"), {
    path: "/reservation/ABC-1",
    locale: "tr",
  });
  assert.deepEqual(resolvePath("/rezervasyon-sorgula"), {
    path: "/lookup",
    locale: "tr",
  });
  assert.deepEqual(resolvePath("/"), { path: "/", locale: null });
  assert.deepEqual(resolvePath("/unknown"), { path: "/unknown", locale: null });
});

test("alternates name every language", () => {
  assert.deepEqual(alternates("/guide/kis-lastigi"), {
    tr: "/rehber/kis-lastigi",
    en: "/guide/kis-lastigi",
  });
});

test("segments are unique across languages and routes", () => {
  const seen = new Set<string>();
  for (const r of Object.values(ROUTES))
    for (const seg of new Set([r.en, r.tr])) {
      assert.equal(seen.has(seg), false, seg);
      seen.add(seg);
    }
});

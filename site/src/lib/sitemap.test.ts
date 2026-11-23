import assert from "node:assert/strict";
import { test } from "node:test";

import { buildSitemapXml, sitemapOrigin, sitemapPath } from "./sitemap.ts";

test("sitemap lists absolute URLs on the site origin", () => {
  const xml = buildSitemapXml("https://acme.example.com", [
    { path: "/", lastmod: "2026-10-18T09:00:00Z" },
    {
      path: "/guide/tr/istanbul-rehberi",
      locale: "tr",
      lastmod: "2026-10-17T12:30:00+03:00",
    },
    { path: "/vehicles?segment=SUV&x=<1>", lastmod: "nope" },
  ]);
  assert.equal(
    xml,
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      "<url><loc>https://acme.example.com/</loc><lastmod>2026-10-18T09:00:00.000Z</lastmod></url>",
      "<url><loc>https://acme.example.com/guide/tr/istanbul-rehberi</loc><lastmod>2026-10-17T09:30:00.000Z</lastmod></url>",
      "<url><loc>https://acme.example.com/vehicles?segment=SUV&amp;x=&lt;1&gt;</loc></url>",
      "</urlset>",
      "",
    ].join("\n"),
  );
});

test("unsafe paths, duplicates and bad origins are skipped", () => {
  const xml = buildSitemapXml("https://acme.example.com/ignored/path", [
    { path: "https://evil.com/", lastmod: "" },
    { path: "//evil.com", lastmod: "" },
    { path: "/a b", lastmod: "" },
    { path: "/x\n", lastmod: "" },
    { path: "/ok", lastmod: "" },
    { path: "/ok", lastmod: "" },
  ]);
  assert.equal(xml.match(/<url>/g)?.length, 1);
  assert.match(xml, /<loc>https:\/\/acme\.example\.com\/ok<\/loc>/);
  assert.equal(sitemapOrigin("javascript:alert(1)"), null);
  assert.equal(sitemapOrigin("https://u:p@x.com"), null);
  assert.equal(
    sitemapOrigin("http://localhost:3100/x"),
    "http://localhost:3100",
  );
  assert.equal(sitemapPath(5), null);
  assert.equal(
    buildSitemapXml("not a url", [{ path: "/", lastmod: "" }]).includes(
      "<url>",
    ),
    false,
  );
  assert.equal(buildSitemapXml("https://a.com", null).includes("<url>"), false);
});

test("lists every page in each offered language with hreflang alternates (TEC-1285)", () => {
  const xml = buildSitemapXml(
    "https://acme.rentopya.app",
    [
      { path: "/vehicles", lastmod: "2026-11-20T10:00:00Z" },
      {
        path: "/guide/tr/kis-lastigi",
        locale: "tr",
        lastmod: "2026-11-21T10:00:00Z",
      },
    ],
    { locales: ["tr", "en"], defaultLocale: "tr" },
  );
  assert.match(xml, /xmlns:xhtml="http:\/\/www.w3.org\/1999\/xhtml"/);
  assert.match(xml, /<loc>https:\/\/acme.rentopya.app\/araclar<\/loc>/);
  assert.match(xml, /<loc>https:\/\/acme.rentopya.app\/vehicles<\/loc>/);
  assert.match(
    xml,
    /hreflang="x-default" href="https:\/\/acme.rentopya.app\/araclar"/,
  );
  // An article exists in one language only: one URL, no alternates.
  assert.match(
    xml,
    /<loc>https:\/\/acme.rentopya.app\/rehber\/tr\/kis-lastigi<\/loc><lastmod>[^<]+<\/lastmod><\/url>/,
  );
  assert.equal((xml.match(/<url>/g) ?? []).length, 3);
});

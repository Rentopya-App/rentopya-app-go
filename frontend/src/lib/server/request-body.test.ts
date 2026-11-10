import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BodyTooLargeError,
  maxProxyBodyBytes,
  readBodyCapped,
} from "./request-body.ts";

function streamOf(sizes: number[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const n of sizes) controller.enqueue(new Uint8Array(n).fill(97));
      controller.close();
    },
  });
}

test("a body within the cap is read whole", async () => {
  const req = new Request("http://panel.test/api/v1/x", {
    method: "POST",
    body: "hello",
  });
  const buf = await readBodyCapped(req, 10);
  assert.equal(new TextDecoder().decode(buf), "hello");
});

test("a declared Content-Length over the cap is refused before reading", async () => {
  const req = new Request("http://panel.test/api/v1/x", {
    method: "POST",
    headers: { "content-length": "11" },
    body: "x",
  });
  await assert.rejects(readBodyCapped(req, 10), BodyTooLargeError);
});

test("a chunked body is refused once it passes the cap", async () => {
  const req = new Request("http://panel.test/api/v1/x", {
    method: "POST",
    body: streamOf([6, 6, 6]),
    // @ts-expect-error Node's fetch needs duplex for a stream body.
    duplex: "half",
  });
  await assert.rejects(readBodyCapped(req, 10), BodyTooLargeError);
});

test("the cap follows a larger storage upload limit", () => {
  assert.equal(maxProxyBodyBytes({}), 64 << 20);
  assert.equal(maxProxyBodyBytes({ STORAGE_MAX_BYTES: "10485760" }), 64 << 20);
  assert.equal(
    maxProxyBodyBytes({ STORAGE_MAX_BYTES: String(200 << 20) }),
    (200 << 20) + (2 << 20),
  );
  assert.equal(maxProxyBodyBytes({ STORAGE_MAX_BYTES: "junk" }), 64 << 20);
});

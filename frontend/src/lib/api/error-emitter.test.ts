import assert from "node:assert/strict";
import { test } from "node:test";

import {
  emitApiError,
  markApiErrorShown,
  setGlobalApiErrorHandler,
  wasApiErrorShown,
} from "./error-emitter.ts";
import type { ApiError } from "./errors";

const fakeError = (message: string) =>
  Object.assign(new Error(message), { status: 422 }) as unknown as ApiError;

test("the same error is shown once (unwrap + query cache + caller)", () => {
  const shown: string[] = [];
  setGlobalApiErrorHandler((e) => shown.push(e.message));
  const err = fakeError("Geçersiz plaka");

  emitApiError(err); // unwrap() before throwing
  emitApiError(err); // MutationCache.onError with the same rejection
  assert.deepEqual(shown, ["Geçersiz plaka"]);
  assert.equal(wasApiErrorShown(err), true);

  // A new failure (new object, same text) is a new toast.
  emitApiError(fakeError("Geçersiz plaka"));
  assert.equal(shown.length, 2);
  setGlobalApiErrorHandler(null);
});

test("without a handler nothing is recorded, so a later handler still shows it", () => {
  setGlobalApiErrorHandler(null);
  const err = fakeError("x");
  emitApiError(err);
  assert.equal(wasApiErrorShown(err), false);

  const shown: ApiError[] = [];
  setGlobalApiErrorHandler((e) => shown.push(e));
  emitApiError(err);
  assert.equal(shown.length, 1);
  setGlobalApiErrorHandler(null);
});

test("wasApiErrorShown tolerates non-objects", () => {
  assert.equal(wasApiErrorShown(undefined), false);
  assert.equal(wasApiErrorShown("boom"), false);
  assert.equal(wasApiErrorShown(new Error("never emitted")), false);
});

test("a caller that toasted the error itself silences the cache emit", () => {
  const shown: ApiError[] = [];
  setGlobalApiErrorHandler((e) => shown.push(e));
  const err = fakeError("Kayıt bulunamadı");
  // silent request: the caller toasts in its catch, then rethrows and the
  // QueryCache onError emits the same error.
  markApiErrorShown(err);
  emitApiError(err);
  assert.equal(shown.length, 0);
  assert.equal(wasApiErrorShown(err), true);
  setGlobalApiErrorHandler(null);
});

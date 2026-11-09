/**
 * Bounded request body reads for the BFF (TEC-1170). `request.arrayBuffer()`
 * buffers whatever the client sends, so one unauthenticated multi-gigabyte
 * POST to `/api/v1/*` could exhaust the panel's memory before the API's own
 * limits ever see it. Every proxied body is read through readBodyCapped.
 *
 * Pure helpers (no Next imports) so node --test can run them.
 */

/** Floor of the BFF body cap: above every fixed API upload limit (30 MiB). */
const MIN_BODY_BYTES = 64 << 20;

/** Framing slack over the configured storage upload limit. */
const MULTIPART_SLACK = 2 << 20;

/** Cap of a public booking API body (the API reads at most 1 MiB). */
export const PUBLIC_BODY_BYTES = 1 << 20;

/**
 * Largest body the BFF forwards: 64 MiB, or the storage upload limit
 * (STORAGE_MAX_BYTES, when the panel's env carries it) plus framing slack.
 */
export function maxProxyBodyBytes(
  env: Record<string, string | undefined> = process.env,
): number {
  const storage = Number(env.STORAGE_MAX_BYTES);
  if (Number.isFinite(storage) && storage > 0) {
    return Math.max(MIN_BODY_BYTES, storage + MULTIPART_SLACK);
  }
  return MIN_BODY_BYTES;
}

export class BodyTooLargeError extends Error {
  readonly limit: number;

  constructor(limit: number) {
    super(`request body exceeds ${limit} bytes`);
    this.limit = limit;
    this.name = "BodyTooLargeError";
  }
}

/**
 * Reads the request body, refusing it (BodyTooLargeError) as soon as it is
 * known to exceed `limit`: from Content-Length before reading, or while
 * streaming a chunked body.
 */
export async function readBodyCapped(
  request: Request,
  limit: number,
): Promise<ArrayBuffer> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) {
    throw new BodyTooLargeError(limit);
  }
  if (!request.body) return new ArrayBuffer(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => undefined);
      throw new BodyTooLargeError(limit);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out.buffer;
}

/** The 413 answer of an oversized body. */
export function bodyTooLargeResponse(): Response {
  return new Response(
    JSON.stringify({ success: false, error: "payload_too_large" }),
    { status: 413, headers: { "Content-Type": "application/json" } },
  );
}

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

/**
 * Direct payment from the branded site: the site starts the provider's
 * hosted checkout itself and the provider sends the customer back to
 * `/payment/{token}/return` on this site, never through the platform's pay
 * page. Where to go next (the reservation page, the customer area, an
 * embedded booking's state) travels sealed (AES-256-GCM) in that return
 * URL's `s` query, because the provider's return is a cross-site POST that
 * carries no Lax cookie. Pure: node --test.
 */
export type PaymentReturn = {
  /** Site origin the checkout was started on (another host never reads it). */
  origin: string;
  /** The payment link token the state belongs to. */
  token: string;
  /** Internal path to open after the return (/reservation/… or /account/…). */
  to: string;
  /** The embedded booking's sealed state, kept for the reservation page. */
  embed?: string;
  /** Unix seconds. */
  expires: number;
};

/** The provider's checkout lives 30 minutes; 3DS and slow banks need slack. */
export const RETURN_TTL = 3 * 60 * 60;

const TO = /^\/(reservation\/[A-Za-z0-9-]{1,40}|account\/[0-9a-f-]{36})$/;
const TOKEN = /^[A-Za-z0-9_-]{20,64}$/;

function key(secret = process.env.SITE_EMBED_SECRET): Buffer {
  if (!secret || secret.length < 32)
    throw new Error("SITE_EMBED_SECRET must contain at least 32 characters");
  return createHash("sha256")
    .update(`rentopia/payment-return/v1:${secret}`)
    .digest();
}

/** The token of a hosted pay link URL (…/pay/{token}), or null. */
export function payLinkToken(url: string): string | null {
  try {
    const m = /^\/pay\/([A-Za-z0-9_-]{20,64})$/.exec(new URL(url).pathname);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

export function sealReturn(state: PaymentReturn, secret?: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  const body = Buffer.concat([
    cipher.update(JSON.stringify(state), "utf8"),
    cipher.final(),
  ]);
  return (
    "p1." + Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url")
  );
}

export function openReturn(
  raw: string | null | undefined,
  origin: string,
  token: string,
  secret?: string,
  now = Date.now(),
): PaymentReturn | null {
  if (!raw || !/^p1\.[A-Za-z0-9_-]+$/.test(raw) || raw.length > 5000)
    return null;
  try {
    const bytes = Buffer.from(raw.slice(3), "base64url");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key(secret),
      bytes.subarray(0, 12),
    );
    decipher.setAuthTag(bytes.subarray(12, 28));
    const state = JSON.parse(
      Buffer.concat([
        decipher.update(bytes.subarray(28)),
        decipher.final(),
      ]).toString("utf8"),
    ) as PaymentReturn;
    if (
      state.origin !== origin ||
      state.token !== token ||
      typeof state.to !== "string" ||
      !TO.test(state.to) ||
      (state.embed !== undefined && typeof state.embed !== "string") ||
      !Number.isFinite(state.expires) ||
      state.expires * 1000 <= now ||
      state.expires * 1000 > now + RETURN_TTL * 1000
    )
      return null;
    return state;
  } catch {
    return null;
  }
}

/** The return URL the provider sends the customer to. */
export function returnURL(
  state: Omit<PaymentReturn, "expires">,
  secret?: string,
  now = Date.now(),
): string | null {
  if (!TOKEN.test(state.token) || !TO.test(state.to)) return null;
  const sealed = sealReturn(
    { ...state, expires: Math.floor(now / 1000) + RETURN_TTL },
    secret,
  );
  return `${state.origin}/payment/${state.token}/return?s=${sealed}`;
}

/**
 * Where the return lands: the internal path with the payment token (the
 * page shows the verified result) and an embedded booking's state.
 */
export function landing(state: PaymentReturn): string {
  const q = new URLSearchParams({ payment: state.token });
  if (state.embed) q.set("s", state.embed);
  return `${state.to}?${q.toString()}`;
}

/** The provider's page: https only (http on localhost for development). */
export function safeCheckoutURL(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  try {
    const u = new URL(raw);
    if (u.username || u.password) return null;
    if (u.protocol === "https:") return u.toString();
    if (
      u.protocol === "http:" &&
      (u.hostname === "localhost" || u.hostname.endsWith(".localhost"))
    )
      return u.toString();
    return null;
  } catch {
    return null;
  }
}

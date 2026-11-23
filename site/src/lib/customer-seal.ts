import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

/**
 * The customer area's sign-in step between "send code" and "verify"
 * (TEC-1284): the contact the customer typed, sealed (AES-256-GCM) into a
 * short-lived HttpOnly cookie, so the code page never puts a phone number or
 * an e-mail address in the URL, the history or a log. Pure: node --test.
 */
export type PendingSignIn = {
  /** Site origin the code was requested on (another host never reads it). */
  origin: string;
  contact: string;
  channel: "sms" | "email";
  /** Unix seconds: the earliest resend and the end of this step. */
  resendAt: number;
  expires: number;
  /** Internal path to open after sign-in. */
  next: string;
};

export const PENDING_TTL = 10 * 60;

function key(secret = process.env.SITE_EMBED_SECRET): Buffer {
  if (!secret || secret.length < 32)
    throw new Error("SITE_EMBED_SECRET must contain at least 32 characters");
  return createHash("sha256")
    .update(`rentopia/customer-sign-in/v1:${secret}`)
    .digest();
}

export function sealPending(state: PendingSignIn, secret?: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  const body = Buffer.concat([
    cipher.update(JSON.stringify(state), "utf8"),
    cipher.final(),
  ]);
  return (
    "c1." + Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url")
  );
}

export function openPending(
  raw: string | null | undefined,
  origin: string,
  secret?: string,
  now = Date.now(),
): PendingSignIn | null {
  if (!raw || !/^c1\.[A-Za-z0-9_-]+$/.test(raw) || raw.length > 2000)
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
    ) as PendingSignIn;
    if (
      state.origin !== origin ||
      typeof state.contact !== "string" ||
      (state.channel !== "sms" && state.channel !== "email") ||
      !Number.isFinite(state.expires) ||
      state.expires * 1000 <= now ||
      state.expires * 1000 > now + PENDING_TTL * 1000 ||
      typeof state.next !== "string"
    )
      return null;
    return state;
  } catch {
    return null;
  }
}

/** Shows a contact partly: "0532 *** ** 33", "a***@example.test". */
export function maskContact(contact: string): string {
  const v = contact.trim();
  const at = v.indexOf("@");
  if (at > 0) return `${v[0]}***${v.slice(at)}`;
  const digits = v.replace(/\D/g, "");
  if (digits.length < 4) return "***";
  return `${digits.slice(0, Math.min(4, digits.length - 2))} *** ** ${digits.slice(-2)}`;
}

/** A same-site path to open after sign-in: the account unless it is one. */
export function accountNext(raw: string | null | undefined): string {
  const v = (raw ?? "").trim();
  return /^\/account(\/[0-9a-f-]{36})?$/.test(v) ? v : "/account";
}

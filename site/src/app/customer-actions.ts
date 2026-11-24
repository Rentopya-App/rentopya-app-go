"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ApiError } from "@/lib/api";
import { siteCheckout } from "@/lib/checkout";
import {
  CUSTOMER_COOKIE,
  PENDING_COOKIE,
  customerApi,
  customerCookieOptions,
} from "@/lib/customer";
import {
  PENDING_TTL,
  accountNext,
  openPending,
  sealPending,
  type PendingSignIn,
} from "@/lib/customer-seal";
import type {
  PayResult,
  SessionIssued,
  StartResult,
} from "@/lib/customer-types";
import { toRFC3339 } from "@/lib/format";
import { getCtx } from "@/lib/server";

/**
 * The customer area's forms (TEC-1284). They post to these actions and work
 * without JavaScript; every redirect stays on the site, in the page's
 * language. Errors travel as short codes in the query, never as API text.
 */

const str = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" ? v.trim() : "";
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function go(path: string): Promise<never> {
  redirect((await getCtx()).href(path));
}

function errorCode(err: unknown): string {
  if (!(err instanceof ApiError)) return "failed";
  if (err.status === 429) return "limited";
  if (err.code === "CODE_UNAVAILABLE") return "unavailable";
  if (err.code === "OTP_INVALID") return "code";
  if (err.status === 400 || err.status === 422) return "invalid";
  return "failed";
}

/** A signed-out visitor (or an expired session) goes back to sign-in. */
async function signedOut(next: string): Promise<never> {
  (await cookies()).delete(CUSTOMER_COOKIE);
  return go(`/login?next=${encodeURIComponent(next)}&error=session`);
}

async function guard() {
  const ctx = await getCtx();
  // Previews and the embedded widget never sign customers in.
  if (ctx.embed || ctx.site.preview) return go("/");
  return ctx;
}

async function sendCode(
  ctx: Awaited<ReturnType<typeof getCtx>>,
  contact: string,
  next: string,
): Promise<StartResult> {
  const out = await customerApi<StartResult>("/auth/start", {
    method: "POST",
    body: { contact },
    session: false,
  });
  const now = Math.floor(Date.now() / 1000);
  const pending: PendingSignIn = {
    origin: ctx.site.origin,
    contact,
    channel: out.channel,
    resendAt: now + (out.resend_after_seconds || 60),
    expires: now + PENDING_TTL,
    next,
  };
  (await cookies()).set(
    PENDING_COOKIE,
    sealPending(pending),
    customerCookieOptions(ctx.site, PENDING_TTL),
  );
  return out;
}

/** Step 1: the phone number or e-mail address → a code (same answer either way). */
export async function startSignIn(form: FormData) {
  const ctx = await guard();
  const contact = str(form, "contact");
  const next = accountNext(str(form, "next"));
  if (contact.length < 5 || contact.length > 254)
    return go(`/login?error=invalid&next=${encodeURIComponent(next)}`);
  try {
    await sendCode(ctx, contact, next);
  } catch (err) {
    return go(
      `/login?error=${errorCode(err)}&next=${encodeURIComponent(next)}`,
    );
  }
  return go("/login?step=code");
}

async function pendingOf(ctx: Awaited<ReturnType<typeof getCtx>>) {
  return openPending(
    (await cookies()).get(PENDING_COOKIE)?.value,
    ctx.site.origin,
  );
}

/** Step 2: the code → a session cookie on this host. */
export async function verifySignIn(form: FormData) {
  const ctx = await guard();
  const pending = await pendingOf(ctx);
  if (!pending) return go("/login?error=expired");
  const code = str(form, "code").replace(/\D/g, "");
  if (code.length !== 6) return go("/login?step=code&error=code");
  let issued: SessionIssued;
  try {
    issued = await customerApi<SessionIssued>("/auth/verify", {
      method: "POST",
      body: { contact: pending.contact, code },
      session: false,
    });
  } catch (err) {
    return go(`/login?step=code&error=${errorCode(err)}`);
  }
  const jar = await cookies();
  const left =
    (new Date(issued.session.hard_expires_at).getTime() - Date.now()) / 1000;
  jar.set(
    CUSTOMER_COOKIE,
    issued.session_token,
    customerCookieOptions(ctx.site, left),
  );
  jar.delete(PENDING_COOKIE);
  return go(pending.next);
}

/** A new code for the same contact, after the resend wait. */
export async function resendCode() {
  const ctx = await guard();
  const pending = await pendingOf(ctx);
  if (!pending) return go("/login?error=expired");
  if (Date.now() / 1000 < pending.resendAt)
    return go("/login?step=code&error=wait");
  try {
    await sendCode(ctx, pending.contact, pending.next);
  } catch (err) {
    return go(`/login?step=code&error=${errorCode(err)}`);
  }
  return go("/login?step=code&sent=1");
}

/** Back to step 1 with another contact. */
export async function changeContact() {
  await guard();
  (await cookies()).delete(PENDING_COOKIE);
  return go("/login");
}

export async function signOut() {
  await guard();
  try {
    await customerApi("/auth/logout", { method: "POST", body: {} });
  } catch {
    // The cookie goes either way.
  }
  (await cookies()).delete(CUSTOMER_COOKIE);
  return go("/login?signed_out=1");
}

/** The hosted pay page of what is due now. */
export async function payReservation(form: FormData) {
  await guard();
  const id = str(form, "reservation");
  if (!UUID.test(id)) return go("/account");
  let link: PayResult;
  try {
    link = await customerApi<PayResult>(`/reservations/${id}/pay`, {
      method: "POST",
      body: {},
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401)
      return signedOut(`/account/${id}`);
    return go(`/account/${id}?error=pay`);
  }
  redirect((await siteCheckout(link.url, `/account/${id}`)) ?? link.url);
}

/** A change or cancellation request (staff answer it in the panel). */
export async function createRequest(form: FormData) {
  await guard();
  const id = str(form, "reservation");
  if (!UUID.test(id)) return go("/account");
  const type = str(form, "type") === "cancel" ? "cancel" : "change";
  const body: Record<string, unknown> = {
    type,
    message: str(form, "message").slice(0, 2000),
  };
  if (type === "change") {
    const starts = toRFC3339(str(form, "start_date"), str(form, "start_time"));
    const ends = toRFC3339(str(form, "end_date"), str(form, "end_time"));
    if (starts) body.requested_starts_at = starts;
    if (ends) body.requested_ends_at = ends;
  }
  try {
    await customerApi(`/reservations/${id}/requests`, {
      method: "POST",
      body,
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401)
      return signedOut(`/account/${id}`);
    return go(`/account/${id}?error=${errorCode(err)}&form=${type}#request`);
  }
  return go(`/account/${id}?request=${type}#requests`);
}

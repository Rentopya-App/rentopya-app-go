import { hasCustomerCookie } from "@/lib/customer";
import type { Ctx } from "@/lib/server";
import type { MessageKey } from "@/messages/tr";

/** Labels of the customer area (TEC-1284). */
const STATUSES = [
  "request",
  "awaiting_review",
  "awaiting_payment",
  "confirmed",
  "cancelled",
  "expired",
  "no_show",
];

export function statusLabel(ctx: Ctx, status: string): string {
  return ctx.t(
    (STATUSES.includes(status)
      ? `res.status.${status}`
      : "res.status.other") as MessageKey,
  );
}

export function documentLabel(ctx: Ctx, kind: string): string {
  return ctx.t(
    (["contract", "handover", "return"].includes(kind)
      ? `acc.doc.${kind}`
      : "acc.doc.other") as MessageKey,
  );
}

/**
 * The header's customer link (TEC-1284): the site's own sign-in page, or the
 * account when a session cookie is present (no API call on every page).
 * Null in previews.
 */
export async function accountLink(
  ctx: Ctx,
): Promise<{ href: string; label: string; signedIn: boolean } | null> {
  if (ctx.site.preview || ctx.embed) return null;
  const signedIn = await hasCustomerCookie();
  return {
    href: ctx.href(signedIn ? "/account" : "/login"),
    label: ctx.t(signedIn ? "nav.account" : "nav.login"),
    signedIn,
  };
}

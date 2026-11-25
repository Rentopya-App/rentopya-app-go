"use server";

import { redirect } from "next/navigation";

import { ApiError, apiFetch } from "@/lib/api";
import { getCtx, getForwardedFor } from "@/lib/server";

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

/**
 * The e-mail links of the marketing double opt-in (TEC-1287). The page
 * asks for a click instead of acting on the GET, so mail scanners that open
 * links cannot confirm (or withdraw) on the person's behalf.
 */
async function act(form: FormData, action: "confirm" | "unsubscribe") {
  const ctx = await getCtx();
  const token = String(form.get("token") ?? "");
  let result = "invalid";
  if (TOKEN.test(token)) {
    try {
      await apiFetch(`/v1/public/site/leads/${action}`, {
        method: "POST",
        body: { token },
        forwardedFor: await getForwardedFor(),
      });
      result = action === "confirm" ? "confirmed" : "unsubscribed";
    } catch (err) {
      result =
        err instanceof ApiError && err.status === 429 ? "busy" : "invalid";
    }
  }
  redirect(ctx.href(`/subscription?result=${result}`));
}

export async function confirmSubscription(form: FormData) {
  await act(form, "confirm");
}

export async function unsubscribe(form: FormData) {
  await act(form, "unsubscribe");
}

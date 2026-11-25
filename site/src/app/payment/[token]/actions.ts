"use server";

import { redirect } from "next/navigation";

import { startCheckout } from "@/lib/checkout";
import { getCtx } from "@/lib/server";

const TOKEN = /^[A-Za-z0-9_-]{20,64}$/;

/** "Pay securely" on the site's pay page: straight to the provider. */
export async function payLink(form: FormData) {
  const ctx = await getCtx();
  const token = String(form.get("token") ?? "");
  if (!TOKEN.test(token)) redirect(ctx.href("/"));
  const page = `/payment/${token}`;
  const url = await startCheckout(token, page);
  redirect(url ?? ctx.href(`${page}?error=checkout`));
}

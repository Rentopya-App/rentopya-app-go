import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";

import { ApiError, apiFetch, apiOrigin, type ApiRequest } from "./api";
import type { CustomerSession, PortalInfo } from "./customer-types";
import { getForwardedFor, getSite } from "./server";
import type { Site } from "./types";

/**
 * The site's customer area (TEC-1284): the customer portal API
 * (/v1/customer/{slug}/*) called by this server only. The session token
 * lives in an HttpOnly cookie of the site's own host; the browser never sees
 * the API, the token or another organization's portal.
 */
export const CUSTOMER_COOKIE = "rtp_cs";
export const PENDING_COOKIE = "rtp_csp";

export function customerCookieOptions(
  site: Pick<Site, "origin">,
  maxAge: number,
) {
  return {
    httpOnly: true,
    secure: site.origin.startsWith("https:"),
    sameSite: "lax" as const,
    path: "/",
    maxAge: Math.max(0, Math.floor(maxAge)),
  };
}

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** The session token of this visitor, or null (shape only; the API decides). */
export async function customerToken(): Promise<string | null> {
  const v = (await cookies()).get(CUSTOMER_COOKIE)?.value ?? "";
  return TOKEN.test(v) ? v : null;
}

/** Whether a session cookie is present (no API call: the header link). */
export async function hasCustomerCookie(): Promise<boolean> {
  return (await customerToken()) !== null;
}

function portalPath(site: Site, path: string): string {
  return `/v1/customer/${encodeURIComponent(site.organization.slug)}${path}`;
}

/** Calls the portal API of this site's organization. */
export async function customerApi<T>(
  path: string,
  req: Omit<ApiRequest, "customerSession" | "forwardedFor"> & {
    session?: boolean;
  } = {},
): Promise<T> {
  const site = await getSite();
  const { session = true, ...rest } = req;
  const token = session ? await customerToken() : null;
  if (session && !token)
    throw new ApiError(401, "CUSTOMER_SESSION_REQUIRED", "Sign in");
  return apiFetch<T>(portalPath(site, path), {
    ...rest,
    customerSession: token ?? undefined,
    forwardedFor: await getForwardedFor(),
  });
}

/** Sign-in channels of the organization (null: the portal is unavailable). */
export const portalInfo = cache(async (): Promise<PortalInfo | null> => {
  try {
    return await customerApi<PortalInfo>("", { session: false });
  } catch {
    return null;
  }
});

/** The signed-in customer of this request, or null. */
export const currentCustomer = cache(
  async (): Promise<CustomerSession | null> => {
    if (!(await customerToken())) return null;
    try {
      return await customerApi<CustomerSession>("/session");
    } catch {
      return null;
    }
  },
);

/** Streams a PDF of the portal API (documents, invoices) as this customer. */
export async function customerPdf(apiPath: string): Promise<Response> {
  const site = await getSite();
  const token = await customerToken();
  const prefix = portalPath(site, "/reservations/");
  // Only this organization's reservation PDFs (download_path is relative to /v1).
  const path = apiPath.startsWith("/v1/") ? apiPath : `/v1${apiPath}`;
  if (
    !token ||
    !path.startsWith(prefix) ||
    !/^[A-Za-z0-9/_-]+\/pdf$/.test(path.slice(prefix.length))
  )
    return new Response(null, { status: 404 });
  let upstream: Response;
  try {
    upstream = await fetch(`${apiOrigin()}${path}`, {
      headers: {
        "X-Customer-Session": token,
        "X-Forwarded-For": await getForwardedFor(),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return new Response(null, { status: 502 });
  }
  const type = upstream.headers.get("content-type") ?? "";
  if (!upstream.ok || !upstream.body || !type.startsWith("application/pdf"))
    return new Response(null, { status: upstream.status === 401 ? 401 : 404 });
  return new Response(upstream.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition":
        upstream.headers.get("content-disposition") ?? "inline",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}

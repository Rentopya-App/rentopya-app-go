import { apiFetch } from "@/lib/api";
import { landing, openReturn } from "@/lib/payment-return";
import { getCtx, getForwardedFor } from "@/lib/server";

const TOKEN = /^[A-Za-z0-9_-]{20,64}$/;

/**
 * The provider's return (iyzico posts the browser here after 3DS). The
 * return is never proof of payment: the body is ignored and the customer
 * goes to the reservation (or customer area) page, which shows the result
 * the API verified with the provider.
 */
async function back(request: Request, token: string): Promise<Response> {
  const ctx = await getCtx();
  let to = "/";
  if (TOKEN.test(token)) {
    const state = openReturn(
      new URL(request.url).searchParams.get("s"),
      ctx.site.origin,
      token,
    );
    if (state) {
      to = landing(state);
    } else {
      // An expired or missing state: the link still names its reservation.
      try {
        const link = await apiFetch<{ reference: string }>(
          `/v1/public/pay/${encodeURIComponent(token)}`,
          { forwardedFor: await getForwardedFor() },
        );
        if (/^[A-Za-z0-9-]{1,40}$/.test(link?.reference ?? ""))
          to = `/reservation/${encodeURIComponent(link.reference)}?payment=${token}`;
      } catch {
        // Unknown link: the home page.
      }
    }
  }
  return new Response(null, {
    status: 303,
    headers: {
      Location: ctx.href(to),
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}

type RouteContext = { params: Promise<{ token: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  return back(request, (await params).token);
}

export async function GET(request: Request, { params }: RouteContext) {
  return back(request, (await params).token);
}

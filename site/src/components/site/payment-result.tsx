import { Alert } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { getForwardedFor, type Ctx } from "@/lib/server";

import { PaymentRefresh } from "./payment-refresh";

type PublicLink = { reference: string; state: string; result: string };

const TOKEN = /^[A-Za-z0-9_-]{20,64}$/;

/**
 * The verified result of a payment the customer just returned from (the
 * `payment` query the return route adds). Only what the API verified with
 * the provider is shown as paid; a link of another reservation shows
 * nothing.
 */
export async function paymentResult(
  ctx: Ctx,
  token: string | undefined,
  reference: string,
): Promise<{ node: React.ReactNode; pending: boolean }> {
  if (!token || !TOKEN.test(token)) return { node: null, pending: false };
  let link: PublicLink;
  try {
    link = await apiFetch<PublicLink>(
      `/v1/public/pay/${encodeURIComponent(token)}?verify=1`,
      { forwardedFor: await getForwardedFor() },
    );
  } catch {
    return { node: null, pending: false };
  }
  if (!link || link.reference !== reference)
    return { node: null, pending: false };
  const { t } = ctx;
  switch (link.state) {
    case "paid":
      return {
        node: (
          <Alert tone="success">
            {t(
              link.result === "late_payment_task"
                ? "res.pay_result.late"
                : "res.pay_result.paid",
            )}
          </Alert>
        ),
        pending: false,
      };
    case "failed":
      return {
        node: <Alert tone="error">{t("res.pay_result.failed")}</Alert>,
        pending: false,
      };
    case "processing":
    case "ready":
      // Right after the return the provider may not have answered yet.
      return {
        node: (
          <Alert>
            <PaymentRefresh
              waiting={t("res.pay_result.processing")}
              slow={t("res.pay_result.slow")}
            />
          </Alert>
        ),
        pending: true,
      };
    default:
      return { node: null, pending: false };
  }
}

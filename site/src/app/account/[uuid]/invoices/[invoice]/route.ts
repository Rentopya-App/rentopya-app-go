import { customerPdf } from "@/lib/customer";
import { getSite } from "@/lib/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An issued invoice's PDF for the signed-in customer (TEC-1284). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ uuid: string; invoice: string }> },
) {
  const { uuid, invoice } = await params;
  if (!UUID.test(uuid) || !UUID.test(invoice))
    return new Response(null, { status: 404 });
  const site = await getSite();
  return customerPdf(
    `/v1/customer/${encodeURIComponent(site.organization.slug)}/reservations/${uuid}/invoices/${invoice}/pdf`,
  );
}

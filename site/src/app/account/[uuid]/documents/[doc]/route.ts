import { customerPdf } from "@/lib/customer";
import { getSite } from "@/lib/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A reservation document's PDF for the signed-in customer (TEC-1284). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ uuid: string; doc: string }> },
) {
  const { uuid, doc } = await params;
  if (!UUID.test(uuid) || !UUID.test(doc))
    return new Response(null, { status: 404 });
  const site = await getSite();
  return customerPdf(
    `/v1/customer/${encodeURIComponent(site.organization.slug)}/reservations/${uuid}/documents/${doc}/pdf`,
  );
}

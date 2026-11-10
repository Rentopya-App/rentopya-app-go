import { headers } from "next/headers";

/**
 * The public origin is only known per request, so Open Graph and canonical
 * URLs resolve against the host that served the page (as the landing does).
 */
export async function publicMetadataBase(): Promise<URL | undefined> {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const proto = headerList.get("x-forwarded-proto") ?? "https";
  return host ? new URL(`${proto}://${host}`) : undefined;
}

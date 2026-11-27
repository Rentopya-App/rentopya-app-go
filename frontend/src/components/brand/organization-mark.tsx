"use client";

import { useState } from "react";

import { apiConfig } from "@/config/api";
import { cn } from "@/lib/utils";

/**
 * The organization's own mark on customer-facing pages (pay link, customer
 * portal; TEC-1284): its logo when it has one, else its name. Customers
 * see the firm they rent from, not the platform. A logo that fails to load
 * (e.g. the organization was suspended) falls back to the name.
 */
export function OrganizationMark({
  name,
  logoUrl,
  className,
}: {
  name?: string | null;
  /** API path from the API (GET /v1/public/organizations/{uuid}/logo). */
  logoUrl?: string | null;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!failed && logoUrl && logoUrl.startsWith("/v1/public/organizations/")) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`${apiConfig.baseUrl.replace(/\/$/, "")}${logoUrl}`}
        alt={name ?? ""}
        onError={() => setFailed(true)}
        className={cn("h-10 w-auto max-w-[220px] object-contain", className)}
      />
    );
  }
  if (!name) return null;
  return (
    <span className={cn("text-lg font-semibold tracking-tight", className)}>
      {name}
    </span>
  );
}

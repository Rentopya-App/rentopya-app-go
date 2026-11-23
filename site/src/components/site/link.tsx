"use client";

import NextLink from "next/link";
import type { ComponentProps } from "react";

import { localizePath } from "@/lib/routes";

import { useSiteLocale } from "./locale-context";

/**
 * next/link with the site's localized URLs (TEC-1285): code links with the
 * internal path ("/vehicles"), the visitor sees the path of the page's
 * language ("/araclar"). Every site link goes through this component.
 */
export default function Link({
  href,
  ...props
}: ComponentProps<typeof NextLink>) {
  const locale = useSiteLocale();
  return (
    <NextLink
      href={typeof href === "string" ? localizePath(href, locale) : href}
      {...props}
    />
  );
}

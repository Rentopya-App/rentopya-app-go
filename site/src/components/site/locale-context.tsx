"use client";

import { createContext, useContext } from "react";

import type { Locale } from "@/lib/types";

const SiteLocale = createContext<Locale>("tr");

/** The page's language for client components (links, forms). */
export function SiteLocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  return <SiteLocale.Provider value={locale}>{children}</SiteLocale.Provider>;
}

export const useSiteLocale = () => useContext(SiteLocale);

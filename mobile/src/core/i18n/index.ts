import { getLocales } from 'expo-localization';
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import { errorKeys } from '@/core/api/error-keys';
import { isApiError } from '@/core/api/errors';
import { storage } from '@/core/storage';

import { NAMESPACES, resources } from './resources';

/** Turkish first, English complete (same rule as the panel). */
export const LANGUAGES = [
  { code: 'tr', name: 'Türkçe' },
  { code: 'en', name: 'English' },
] as const;

export type Language = (typeof LANGUAGES)[number]['code'];

const PREF_KEY = 'pref.language';

export function isLanguage(v: unknown): v is Language {
  return v === 'tr' || v === 'en';
}

/** Saved choice, else the device language when supported, else Turkish. */
function detect(): Language {
  const saved = storage.getString(PREF_KEY);
  if (isLanguage(saved)) return saved;
  for (const l of getLocales()) if (isLanguage(l.languageCode)) return l.languageCode;
  return 'tr';
}

export const i18n = createInstance();

i18n.use(initReactI18next).init({
  resources,
  lng: detect(),
  fallbackLng: 'tr',
  ns: NAMESPACES,
  defaultNS: 'common',
  // Keys are flat ("status.active"), like the web catalogs.
  keySeparator: false,
  nsSeparator: ':',
  interpolation: { escapeValue: false },
  returnNull: false,
  initAsync: false,
});

export async function setLanguage(lang: Language) {
  storage.set(PREF_KEY, lang);
  await i18n.changeLanguage(lang);
}

/**
 * Translates a backend error code: the web's errors catalog, then the app's
 * own codes (`common:codes.*`), then the HTTP status text, else `fallback`
 * or the generic message. See `core/api/error-keys.ts`.
 */
export function errorMessage(code: string | undefined, fallback?: string, status?: number) {
  const key = errorKeys(code, status).find((k) => i18n.exists(k));
  return key ? i18n.t(key) : (fallback ?? i18n.t('common:error_generic'));
}

/** The message for anything a call threw (ApiError or not). */
export function apiErrorMessage(e: unknown) {
  return isApiError(e) ? errorMessage(e.code, undefined, e.status) : errorMessage(undefined);
}

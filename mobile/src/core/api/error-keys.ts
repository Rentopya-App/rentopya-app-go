/**
 * i18n keys that may translate a failed call, most specific first: the
 * panel's code catalog (`frontend/src/locales/*\/errors.json`, so web and
 * mobile say the same thing), the app's own codes (`common` namespace: codes
 * that only a phone sees, such as NETWORK_ERROR), then the panel's HTTP status
 * text. The caller falls back to `common:error_generic`. Free of app imports
 * so it runs under `node --test`.
 */
export function errorKeys(code: string | undefined, status?: number): string[] {
  const keys: string[] = [];
  if (code) keys.push(`errors:codes.${code}`, `common:codes.${code}`);
  if (status && status >= 400) keys.push(`errors:http.${status}`);
  return keys;
}

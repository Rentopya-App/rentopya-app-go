/**
 * Auth.js session cookie naming, shared by the Auth.js config (`auth.ts`)
 * and the BFF (`lib/server/auth-tokens.ts`).
 *
 * Auth.js names the session cookie after the AUTH_URL scheme
 * (`__Secure-` prefix only on https) and salts the JWT with that name. The
 * BFF used to pick the name from NODE_ENV, so a production build served on
 * plain HTTP signed in and then lost the session (401) on the first BFF call.
 * Both sides follow this one rule. Pure module: no imports, unit tested.
 */

type AuthEnv = Record<string, string | undefined>;

const SECURE_SESSION_COOKIE = "__Secure-authjs.session-token";
const PLAIN_SESSION_COOKIE = "authjs.session-token";

/** Every name the session cookie can have (for clearing both variants). */
export const SESSION_COOKIE_BASES = [
  PLAIN_SESSION_COOKIE,
  SECURE_SESSION_COOKIE,
] as const;

/** The configured public origin of the panel (AUTH_URL, legacy NEXTAUTH_URL). */
function authUrl(env: AuthEnv) {
  const value = (env.AUTH_URL ?? env.NEXTAUTH_URL ?? "").trim();
  return value || null;
}

/** True when AUTH_URL is an https origin. */
export function authUrlIsHttps(env: AuthEnv = process.env) {
  return authUrl(env)?.toLowerCase().startsWith("https://") ?? false;
}

/**
 * Whether Auth.js cookies are `Secure` (and `__Secure-` prefixed): follows the
 * AUTH_URL scheme; without AUTH_URL, production builds are assumed to be
 * served over https.
 */
export function usesSecureCookies(env: AuthEnv = process.env) {
  if (authUrl(env)) return authUrlIsHttps(env);
  return env.NODE_ENV === "production";
}

/** Name (and JWT salt) of the Auth.js session cookie. */
export function sessionCookieName(env: AuthEnv = process.env) {
  return usesSecureCookies(env) ? SECURE_SESSION_COOKIE : PLAIN_SESSION_COOKIE;
}

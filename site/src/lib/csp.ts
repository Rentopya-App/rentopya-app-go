/**
 * The branded site's script policy (TEC-1286): a nonce per request with
 * 'strict-dynamic', so only scripts the server rendered (Next's own and
 * those they load) run; an injected <script> does not. Sent as
 * Content-Security-Policy-Report-Only first, with violations going to
 * Sentry; the enforced header keeps frame-ancestors / base-uri /
 * form-action (lib/preview.ts, lib/widget.ts). Pure: node --test.
 *
 * Styles allow 'unsafe-inline': React renders style attributes, which a
 * nonce cannot cover; style injection is far less dangerous than script.
 */
export type CspOptions = {
  nonce: string;
  /** GA4 measurement id of the site (adds Google's tag and collect hosts). */
  ga4?: string | null;
  /** Sentry security endpoint (report-uri), or "". */
  reportUri?: string;
  /** Development: React's dev runtime needs eval. */
  dev?: boolean;
};

const GA_SCRIPT = ["https://www.googletagmanager.com"];
const GA_CONNECT = [
  "https://*.google-analytics.com",
  "https://*.analytics.google.com",
  "https://www.googletagmanager.com",
];
const GA_IMG = [
  "https://*.google-analytics.com",
  "https://www.googletagmanager.com",
];

export function sitePolicy(o: CspOptions): string {
  const ga = Boolean(o.ga4);
  const directives: [string, string[]][] = [
    ["default-src", ["'self'"]],
    [
      "script-src",
      [
        "'self'",
        `'nonce-${o.nonce}'`,
        "'strict-dynamic'",
        ...(o.dev ? ["'unsafe-eval'"] : []),
        ...(ga ? GA_SCRIPT : []),
      ],
    ],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", ["'self'", "data:", "blob:", ...(ga ? GA_IMG : [])]],
    ["font-src", ["'self'", "data:"]],
    [
      "connect-src",
      ["'self'", ...(ga ? GA_CONNECT : []), ...(o.dev ? ["ws:"] : [])],
    ],
    ["object-src", ["'none'"]],
    ["frame-src", ["'none'"]],
    ["worker-src", ["'self'", "blob:"]],
    ["manifest-src", ["'self'"]],
  ];
  if (o.reportUri) directives.push(["report-uri", [o.reportUri]]);
  return directives.map(([k, v]) => `${k} ${v.join(" ")}`).join("; ");
}

/** A fresh nonce (16 random bytes, base64). */
export function newNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Sentry's CSP report endpoint for a DSN
 * (https://KEY@HOST/PROJECT → https://HOST/api/PROJECT/security/?sentry_key=KEY),
 * or "" for none or a malformed DSN.
 */
export function sentryReportUri(
  dsn: string | undefined,
  environment?: string,
  release?: string,
): string {
  if (!dsn) return "";
  try {
    const u = new URL(dsn.trim());
    const project = u.pathname.replace(/^\/+|\/+$/g, "");
    if (u.protocol !== "https:" || !u.username || !/^\d+$/.test(project))
      return "";
    const out = new URL(`https://${u.host}/api/${project}/security/`);
    out.searchParams.set("sentry_key", u.username);
    if (environment) out.searchParams.set("sentry_environment", environment);
    if (release) out.searchParams.set("sentry_release", release);
    return out.toString();
  } catch {
    return "";
  }
}

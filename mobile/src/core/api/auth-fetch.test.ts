import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createAuthFetch, tenantAccessLost, type Tokens } from './auth-fetch.ts';

const API = 'https://api.test';

type Call = { url: string; method: string; headers: Record<string, string>; body?: string };

/** A fake API: `/v1/auth/refresh` rotates the pair, every other route checks the Bearer. */
function setup(opts: {
  tokens?: Tokens | null;
  now?: number;
  refresh?: (body: { refresh_token: string }) => Response | Promise<Response>;
  route?: (call: Call, tokens: Tokens | null) => Response | Promise<Response>;
  organization?: string | null;
}) {
  let tokens: Tokens | null =
    opts.tokens === undefined ? { access: 'a1', refresh: 'r1', accessExpiresAt: 10_000_000 } : opts.tokens;
  let org = opts.organization ?? null;
  const calls: Call[] = [];
  const events = { expired: 0, lost: [] as { org: string; code: string }[] };
  let rotation = 1;
  const valid = () => `a${rotation}`;

  const { authFetch, refreshTokens } = createAuthFetch({
    apiUrl: API,
    now: () => opts.now ?? 0,
    getTokens: () => tokens,
    saveTokens: async (t) => {
      tokens = t;
    },
    getOrganization: () => org,
    headers: () => ({ Accept: 'application/json', 'X-App-Version': '1.0.0' }),
    onSessionExpired: () => {
      events.expired++;
    },
    onTenantAccessLost: (o, code) => events.lost.push({ org: o, code }),
    fetch: async (req) => {
      const body = req.method === 'GET' ? undefined : await req.text();
      const call: Call = { url: req.url, method: req.method, headers: Object.fromEntries(req.headers), body };
      calls.push(call);
      const path = new URL(req.url).pathname;
      if (path === '/v1/auth/refresh') {
        // Let concurrent callers pile up before the answer.
        await new Promise((r) => setTimeout(r, 5));
        const parsed = JSON.parse(body ?? '{}') as { refresh_token: string };
        if (opts.refresh) return opts.refresh(parsed);
        if (parsed.refresh_token !== `r${rotation}`) return json(401, { error: { code: 'UNAUTHENTICATED' } });
        rotation++;
        return json(200, {
          data: { access_token: `a${rotation}`, refresh_token: `r${rotation}`, token_type: 'Bearer', expires_in: 900 },
        });
      }
      if (opts.route) return opts.route(call, tokens);
      return call.headers.authorization === `Bearer ${valid()}` ? json(200, { data: { ok: true } }) : json(401, {});
    },
  });
  return {
    authFetch,
    refreshTokens,
    calls,
    events,
    tokens: () => tokens,
    setOrg: (o: string | null) => {
      org = o;
    },
  };
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const get = (path: string) => new Request(`${API}${path}`);

test('sends the Bearer, the fixed headers and no X-Organization outside /v1/tenant', async () => {
  const s = setup({ organization: 'acme' });
  const res = await s.authFetch(get('/v1/auth/me'));
  assert.equal(res.status, 200);
  assert.equal(s.calls[0].headers.authorization, 'Bearer a1');
  assert.equal(s.calls[0].headers['x-app-version'], '1.0.0');
  assert.equal(s.calls[0].headers['x-organization'], undefined);
});

test('injects X-Organization on /v1/tenant/* only, with the organization picked when the call started', async () => {
  const s = setup({ organization: 'acme' });
  await s.authFetch(get('/v1/tenant/context'));
  assert.equal(s.calls[0].headers['x-organization'], 'acme');
  s.setOrg(null);
  await s.authFetch(get('/v1/tenant/branches'));
  assert.equal(s.calls[1].headers['x-organization'], undefined);
});

test('login and refresh never carry the Bearer', async () => {
  const s = setup({ route: () => json(401, { error: { code: 'INVALID_CREDENTIALS' } }) });
  const res = await s.authFetch(new Request(`${API}/v1/auth/login`, { method: 'POST', body: '{}' }));
  assert.equal(res.status, 401);
  assert.equal(s.calls.length, 1, 'a wrong password is never refreshed and resent');
  assert.equal(s.calls[0].headers.authorization, undefined);
});

test('a 401 refreshes once (rotation) and resends with the new access token', async () => {
  const s = setup({ tokens: { access: 'stale', refresh: 'r1', accessExpiresAt: 10_000_000 } });
  const res = await s.authFetch(get('/v1/auth/me'));
  assert.equal(res.status, 200);
  assert.deepEqual(
    s.calls.map((c) => new URL(c.url).pathname),
    ['/v1/auth/me', '/v1/auth/refresh', '/v1/auth/me'],
  );
  assert.equal(JSON.parse(s.calls[1].body!).refresh_token, 'r1');
  assert.equal(s.calls[2].headers.authorization, 'Bearer a2');
  assert.equal(s.tokens()?.refresh, 'r2', 'the rotated refresh token replaces the used one');
  assert.equal(s.tokens()?.accessExpiresAt, 900_000);
});

test('concurrent 401s share one refresh (single flight): the refresh token is used once', async () => {
  const s = setup({ tokens: { access: 'stale', refresh: 'r1', accessExpiresAt: 10_000_000 } });
  const all = await Promise.all([1, 2, 3, 4].map(() => s.authFetch(get('/v1/auth/me'))));
  assert.deepEqual(
    all.map((r) => r.status),
    [200, 200, 200, 200],
  );
  const refreshes = s.calls.filter((c) => c.url.endsWith('/v1/auth/refresh'));
  assert.equal(refreshes.length, 1);
  assert.equal(s.events.expired, 0);
});

test('a 401 after another request already rotated the pair resends without a second refresh', async () => {
  let first = true;
  const s = setup({
    tokens: { access: 'a1', refresh: 'r1', accessExpiresAt: 10_000_000 },
    route: async (call) => {
      if (first) {
        first = false;
        // While this request was in flight, another one rotated the pair.
        await s.refreshTokens();
        return json(401, {});
      }
      return call.headers.authorization === 'Bearer a2' ? json(200, {}) : json(401, {});
    },
  });
  const res = await s.authFetch(get('/v1/tenant/context'));
  assert.equal(res.status, 200);
  assert.equal(s.calls.filter((c) => c.url.endsWith('/v1/auth/refresh')).length, 1);
});

test('refreshes ahead of expiry instead of waiting for the 401', async () => {
  const s = setup({ now: 1_000_000, tokens: { access: 'a1', refresh: 'r1', accessExpiresAt: 1_010_000 } });
  await s.authFetch(get('/v1/auth/me'));
  assert.deepEqual(
    s.calls.map((c) => new URL(c.url).pathname),
    ['/v1/auth/refresh', '/v1/auth/me'],
  );
  assert.equal(s.calls[1].headers.authorization, 'Bearer a2');
});

test('a refused refresh token ends the session; the 401 is returned as is', async () => {
  const s = setup({
    tokens: { access: 'stale', refresh: 'reused', accessExpiresAt: 10_000_000 },
    refresh: () => json(401, { error: { code: 'UNAUTHENTICATED' } }),
  });
  const res = await s.authFetch(get('/v1/auth/me'));
  assert.equal(res.status, 401);
  assert.equal(s.events.expired, 1);
  assert.equal(s.calls.length, 2, 'no resend after a failed refresh');
});

test('a network failure or 5xx on refresh keeps the session (offline signs nobody out)', async () => {
  const down = setup({
    tokens: { access: 'stale', refresh: 'r1', accessExpiresAt: 10_000_000 },
    refresh: () => json(503, {}),
  });
  assert.equal(await down.refreshTokens(), false);
  assert.equal(down.events.expired, 0);
  const offline = setup({
    tokens: { access: 'stale', refresh: 'r1', accessExpiresAt: 10_000_000 },
    refresh: () => {
      throw new TypeError('Network request failed');
    },
  });
  assert.equal(await offline.refreshTokens(), false);
  assert.equal(offline.events.expired, 0);
});

test('step-up and native OAuth 401s are answers, never refreshed', async () => {
  const s = setup({ route: () => json(401, { error: { code: 'INVALID_MFA_CODE' } }) });
  await s.authFetch(new Request(`${API}/v1/auth/step-up/totp`, { method: 'POST', body: '{}' }));
  await s.authFetch(new Request(`${API}/v1/auth/oauth/apple/native`, { method: 'POST', body: '{}' }));
  assert.equal(s.calls.filter((c) => c.url.endsWith('/v1/auth/refresh')).length, 0);
});

test('a lost membership on a tenant call is reported with the organization of that call', async () => {
  const s = setup({
    organization: 'acme',
    route: () => json(403, { success: false, error: { code: 'NO_TENANT_MEMBERSHIP', message: 'x' } }),
  });
  const res = await s.authFetch(get('/v1/tenant/context'));
  assert.equal(res.status, 403);
  assert.deepEqual(s.events.lost, [{ org: 'acme', code: 'NO_TENANT_MEMBERSHIP' }]);
  assert.equal((await res.json()).error.code, 'NO_TENANT_MEMBERSHIP', 'the body is still readable');
});

test('a plain FORBIDDEN or a missing record is not a lost membership', async () => {
  const s = setup({
    organization: 'acme',
    route: (c) =>
      c.url.includes('branches/')
        ? json(404, { error: { code: 'NOT_FOUND' } })
        : json(403, { error: { code: 'FORBIDDEN' } }),
  });
  await s.authFetch(get('/v1/tenant/branches'));
  await s.authFetch(get('/v1/tenant/branches/abc'));
  assert.deepEqual(s.events.lost, []);
});

test('tenantAccessLost', () => {
  assert.equal(tenantAccessLost('/v1/tenant/vehicles', 403, 'ORGANIZATION_SUSPENDED'), true);
  assert.equal(tenantAccessLost('/v1/tenant/vehicles', 403, 'ORGANIZATION_ACCESS_EXPIRED'), true);
  assert.equal(tenantAccessLost('/v1/tenant/vehicles', 400, 'ORGANIZATION_REQUIRED'), true);
  assert.equal(tenantAccessLost('/v1/tenant/context', 404, undefined), true);
  assert.equal(tenantAccessLost('/v1/tenant/vehicles/x', 404, 'NOT_FOUND'), false);
  assert.equal(tenantAccessLost('/v1/tenant/vehicles', 403, 'FEATURE_NOT_ENABLED'), false);
  assert.equal(tenantAccessLost('/v1/auth/me', 403, 'NO_TENANT_MEMBERSHIP'), false);
});

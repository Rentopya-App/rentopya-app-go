import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';

// @ts-expect-error plain .mjs helper shared with scripts/gen-permissions.mjs
import { MOBILE_PREFIXES, readPanelPermissions } from '../../../scripts/panel-permissions.mjs';
import { Permission } from './permission-slugs.ts';

const panel = path.join(import.meta.dirname, '../../../../frontend/src/config/permissions.ts');

test('permission-slugs.ts mirrors the panel catalog (run `npm run permissions:gen`)', () => {
  const want = Object.fromEntries(readPanelPermissions(panel) as [string, string][]);
  assert.deepEqual({ ...Permission }, want);
});

test('only organization-scoped and account-level slugs', () => {
  for (const slug of Object.values(Permission)) {
    assert.ok(
      (MOBILE_PREFIXES as string[]).some((p) => slug.startsWith(p)),
      slug,
    );
  }
  assert.equal(Permission.TenantBranchesRead, 'tenant.branches.read');
});

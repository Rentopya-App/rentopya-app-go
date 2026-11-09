#!/usr/bin/env node
/**
 * CI contract for the generated OpenAPI types (boilerplate `mobile-ci` skill):
 *   - `openapi-typescript` is pinned to an exact version (no ^ / ~ / range)
 *   - `src/core/api/schema.d.ts` is what `npm run api:generate` writes for the
 *     current `../backend/docs/openapi.yaml` (no diff)
 *
 * Usage: npm run api:check
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
let failed = false;

const pinned = pkg.devDependencies?.['openapi-typescript'];
if (!pinned || !/^\d+\.\d+\.\d+$/.test(pinned)) {
  console.error(
    `error  openapi-typescript must be pinned to an exact version in devDependencies (found ${pinned ?? 'nothing'})`,
  );
  failed = true;
}

const committed = path.join(root, 'src/core/api/schema.d.ts');
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'api-check-')), 'schema.d.ts');
execFileSync(
  path.join(root, 'node_modules/.bin/openapi-typescript'),
  [path.join(root, '../backend/docs/openapi.yaml'), '-o', tmp],
  { stdio: ['ignore', 'ignore', 'inherit'] },
);
const want = fs.readFileSync(tmp, 'utf8');
const have = fs.existsSync(committed) ? fs.readFileSync(committed, 'utf8') : '';
if (want !== have) {
  console.error('error  src/core/api/schema.d.ts is stale: run `npm run api:generate` and commit the result');
  failed = true;
}

if (failed) process.exit(1);
console.log('api types: pinned generator, schema.d.ts up to date');

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { branchKey, resolveBranch } from './branch.ts';

test('the saved branch stands while it is in the member scope', () => {
  const branches = [{ uuid: 'b1' }, { uuid: 'b2' }];
  assert.equal(resolveBranch('b2', branches), 'b2');
  assert.equal(resolveBranch(null, branches), null);
});

test('a branch outside the scope (or archived) means all branches', () => {
  assert.equal(resolveBranch('gone', [{ uuid: 'b1' }]), null);
  assert.equal(resolveBranch('b1', []), null);
});

test('while the list loads the saved choice stands', () => {
  assert.equal(resolveBranch('b1', undefined), 'b1');
});

test('one key per organization', () => {
  assert.notEqual(branchKey('org-a'), branchKey('org-b'));
});

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { linkChoice } from './link-choice.ts';

test('reads the ticket and whether a new account may be created', () => {
  assert.deepEqual(
    linkChoice([
      { field: 'link_ticket', message: 'abc' },
      { field: 'provider', message: 'apple' },
      { field: 'expires_in', message: '900' },
      { field: 'register_allowed', message: 'true' },
    ]),
    { ticket: 'abc', registerAllowed: true },
  );
  assert.deepEqual(linkChoice([{ field: 'link_ticket', message: 'abc' }]), { ticket: 'abc', registerAllowed: false });
});

test('no ticket, no choice', () => {
  assert.equal(linkChoice(undefined), null);
  assert.equal(linkChoice([{ field: 'provider', message: 'apple' }]), null);
});

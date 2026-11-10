import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  assigneesFor,
  assigneesForAll,
  assignProblemKey,
  boardQuery,
  bulkOutcome,
  parseUuids,
  toggle,
  unassignedQuery,
  type FieldTaskAssignee,
} from './lib.ts';

const TZ = 'Europe/Istanbul';

const person = (uuid: string, scope: 'all' | 'selected', branches: string[] = []): FieldTaskAssignee => ({
  uuid,
  name: uuid,
  surname: '',
  email: `${uuid}@x.test`,
  branch_scope: scope,
  branch_uuids: branches,
});

test('board query: open tasks, a day in the organization zone, type, assignee and branch', () => {
  assert.deepEqual(boardQuery({ q: '', status: 'live', day: null, taskType: null, assignee: null, branch: null }, TZ), {
    sort: 'due_at',
    status: 'planned,assigned,en_route,issue_reported',
  });
  assert.deepEqual(
    boardQuery(
      { q: ' 34 ', status: 'all', day: '2026-11-10', taskType: 'transfer', assignee: 'none', branch: 'b1' },
      TZ,
    ),
    {
      sort: 'due_at',
      q: '34',
      task_type: 'transfer',
      assignee: 'none',
      branch: 'b1',
      due_from: '2026-11-09T21:00:00.000Z',
      due_to: '2026-11-10T21:00:00.000Z',
    },
  );
});

test('unassigned call-out counts planned / issue tasks of nobody', () => {
  assert.deepEqual(unassignedQuery({ day: null, branch: 'b1' }, TZ), {
    limit: 1,
    offset: 0,
    status: 'planned,issue_reported',
    assignee: 'none',
    branch: 'b1',
  });
});

test('assignees cover the task branch or every branch; a lot needs all of them covered', () => {
  const people = [person('all', 'all'), person('a', 'selected', ['b1']), person('ab', 'selected', ['b1', 'b2'])];
  assert.deepEqual(
    assigneesFor(people, ['b2']).map((p) => p.uuid),
    ['all', 'ab'],
  );
  assert.equal(assigneesFor(people, []).length, 3);
  const tasks = [{ branch: { uuid: 'b1' } }, { branch: { uuid: 'b3' }, to_branch: { uuid: 'b2' } }];
  assert.deepEqual(
    assigneesForAll(people, tasks).map((p) => p.uuid),
    ['all', 'ab'],
  );
});

test('selection helpers', () => {
  assert.deepEqual(parseUuids('a, b,,a'), ['a', 'b']);
  assert.deepEqual(parseUuids(['a', 'c']), ['a', 'c']);
  assert.deepEqual(parseUuids(undefined), []);
  assert.deepEqual(toggle(['a'], 'b'), ['a', 'b']);
  assert.deepEqual(toggle(['a', 'b'], 'a'), ['b']);
});

test('bulk answer: summary now or a queued job', () => {
  assert.deepEqual(bulkOutcome({ sync: true, summary: { total: 3, succeeded: 2, failed: 1 } }), {
    kind: 'done',
    succeeded: 2,
    failed: 1,
  });
  assert.deepEqual(
    bulkOutcome({ uuid: 'j', resource: 'tenant.field_tasks', action: 'assign', status: 'queued', created_at: '' }),
    { kind: 'queued' },
  );
});

test('assign problem codes', () => {
  assert.equal(assignProblemKey([{ code: 'x' }, { code: 'branch_not_allowed' }]), 'assign_problems.branch_not_allowed');
  assert.equal(assignProblemKey(undefined), null);
});

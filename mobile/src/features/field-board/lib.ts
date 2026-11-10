/**
 * Field task board rules (the panel's `/field/board`): filters, the
 * unassigned call-out, who may take a task and the bulk assign answer.
 * Free of app imports so it runs under `node --test`.
 */
import type { components } from '../../core/api/schema';
import { zonedIso } from '../../core/zoned.ts';
import { LIVE_STATUSES, type StatusFilter } from '../field-tasks/lib.ts';

type S = components['schemas'];
export type FieldTaskAssignee = S['FieldTaskAssignee'];
export type FieldTaskType = S['FieldTask']['task_type'];
export type BulkJob = S['BulkJob'];
export type BulkSummary = S['BulkSummary'];

export const TASK_TYPES: readonly FieldTaskType[] = [
  'handover',
  'return',
  'transfer',
  'preparation',
  'cleaning',
  'maintenance',
  'deposit',
  'other',
];

/** Statuses of work nobody has picked up yet (the panel's call-out). */
export const UNASSIGNED_STATUSES = ['planned', 'issue_reported'] as const;

/** The bulk action id of `POST /v1/tenant/field-tasks/bulk` (`params.user_uuid`, empty = unassign). */
export const BULK_ASSIGN = 'assign';

export type BoardFilters = {
  q: string;
  status: StatusFilter;
  /** `YYYY-MM-DD` in the organization zone, or null for every day. */
  day: string | null;
  taskType: FieldTaskType | null;
  /** A member uuid, `none` (unassigned) or null (anyone). */
  assignee: string | null;
  branch: string | null;
};

function dayWindow(day: string | null, timeZone: string | null | undefined) {
  if (!day) return {};
  const next = new Date(`${day}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return {
    due_from: zonedIso(day, '00:00', timeZone),
    due_to: zonedIso(next.toISOString().slice(0, 10), '00:00', timeZone),
  };
}

/** `GET /v1/tenant/field-tasks` query of the board's filters. */
export function boardQuery(f: BoardFilters, timeZone: string | null | undefined) {
  const q = f.q.trim();
  return {
    sort: 'due_at',
    ...(q ? { q } : {}),
    ...(f.status === 'all' ? {} : { status: f.status === 'live' ? LIVE_STATUSES.join(',') : f.status }),
    ...(f.taskType ? { task_type: f.taskType } : {}),
    ...(f.assignee ? { assignee: f.assignee } : {}),
    ...(f.branch ? { branch: f.branch } : {}),
    ...dayWindow(f.day, timeZone),
  };
}

/** Count query of open work nobody has (whatever the other filters say), same day and branch. */
export function unassignedQuery(f: Pick<BoardFilters, 'day' | 'branch'>, timeZone: string | null | undefined) {
  return {
    limit: 1,
    offset: 0,
    status: UNASSIGNED_STATUSES.join(','),
    assignee: 'none',
    ...(f.branch ? { branch: f.branch } : {}),
    ...dayWindow(f.day, timeZone),
  };
}

/** Members who cover every branch, or one of the given ones (the task's branch and a transfer's destination). */
export function assigneesFor(people: readonly FieldTaskAssignee[], branchUuids: readonly string[]) {
  if (branchUuids.length === 0) return [...people];
  return people.filter((p) => p.branch_scope === 'all' || branchUuids.some((b) => p.branch_uuids.includes(b)));
}

/** Branches every selected task needs covered: assignees must work all of them to take the lot. */
export function assigneesForAll(
  people: readonly FieldTaskAssignee[],
  tasks: readonly { branch: { uuid: string }; to_branch?: { uuid: string } | null }[],
) {
  return tasks.reduce<FieldTaskAssignee[]>(
    (left, task) => assigneesFor(left, [task.branch.uuid, task.to_branch?.uuid ?? ''].filter(Boolean)),
    [...people],
  );
}

/** Parses the `uuids` route param (comma-joined) into distinct uuids. */
export function parseUuids(param: string | string[] | undefined) {
  const raw = Array.isArray(param) ? param.join(',') : (param ?? '');
  return [
    ...new Set(
      raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
}

/** Toggles a uuid in a selection. */
export function toggle(selection: readonly string[], uuid: string) {
  return selection.includes(uuid) ? selection.filter((x) => x !== uuid) : [...selection, uuid];
}

export type BulkOutcome = { kind: 'done'; succeeded: number; failed: number } | { kind: 'queued' };

/** The bulk answer: `200` with a summary (done now) or `202` with a job (runs in the background). */
export function bulkOutcome(data: { sync?: boolean; summary?: BulkSummary } | BulkJob): BulkOutcome {
  if ('uuid' in data && typeof data.uuid === 'string') return { kind: 'queued' };
  const s = (data as { summary?: BulkSummary }).summary ?? {};
  return { kind: 'done', succeeded: s.succeeded ?? 0, failed: s.failed ?? 0 };
}

/** Assign refusals the API names in `details[].code` (translated under `transfers_app:assign_problems.*`). */
export const ASSIGN_PROBLEM_CODES = [
  'not_found',
  'not_field_staff',
  'branch_not_allowed',
  'task_closed',
  'concurrent',
] as const;

export function assignProblemKey(details: readonly { code?: string }[] | undefined | null) {
  for (const d of details ?? []) {
    if (d.code && (ASSIGN_PROBLEM_CODES as readonly string[]).includes(d.code)) return `assign_problems.${d.code}`;
  }
  return null;
}

/**
 * The "glance" summary: today's handovers and returns and the next job, as
 * the Home Screen widget and Siri / Shortcuts read it from the App Group
 * (`group.com.rentopya.app`). Neither the widget nor the App Intents call the
 * API or hold a token: the app writes this whenever the Today screen loads.
 *
 * Free of app imports so it runs under `node --test`: formatting and
 * translation come in as functions. `app-intents/GlanceSnapshot.swift`
 * decodes the same shape; bump `v` on both sides when it changes.
 */
import type { components } from '../../core/api/schema';

type S = components['schemas'];
type Overview = S['TenantOverview'];
type OperationItem = S['OverviewOperationItem'];

export const SUMMARY_VERSION = 1;

/** At most this many open jobs travel (the widget shows one, Siri's card a few). */
export const MAX_JOBS = 8;

/** Widget timeline step: the "late" marks and the day rollover move without the app. */
export const TIMELINE_STEP_MS = 15 * 60_000;

export type JobType = 'handover' | 'return';

export type GlanceJob = {
  /** Rental uuid; the widget row opens `rentopya://rentals/<id>`. */
  id: string;
  type: JobType;
  /** Due time, epoch ms. */
  at: number;
  /** "14:30" in the organization zone. */
  time: string;
  plate: string;
  /** "AY" for "Ayşe Yılmaz": the widget shows initials only, never the full name. */
  initials: string;
  /** Siri's sentence for this job ("14:30 teslim: 34 ABC 123 (AY)"). */
  say: string;
};

export type GlanceState = 'ok' | 'signedOut' | 'noAccess';

export type GlanceLabels = {
  title: string;
  handovers: string;
  returns: string;
  next: string;
  none: string;
  late: string;
  handover: string;
  return: string;
  signedOut: string;
  noAccess: string;
  stale: string;
  updated: string;
};

export type GlanceTexts = {
  /** "Bugün 5 teslim (2 tamamlandı) ve 3 iade (1 tamamlandı) var." */
  summary: string;
  /** "Sıradaki iş:" before a job's `say`. */
  nextIntro: string;
  noNext: string;
  /** Another day's numbers: "open the app". */
  stale: string;
  signedOut: string;
  noAccess: string;
  /** "Son güncelleme 14:05." appended to old answers. */
  updated: string;
};

export type TodaySummary = {
  v: typeof SUMMARY_VERSION;
  state: GlanceState;
  org: string;
  /** The branch filter of the Today screen; empty for all branches. */
  branch: string;
  /** `YYYY-MM-DD` of the organization's day; another day's summary is shown as stale. */
  date: string;
  /** "Pazartesi 9 Kasım". */
  day: string;
  /** Epoch ms of the day's end (exclusive), from the API's `today` window. */
  dayEnd: number;
  updatedAt: number;
  updatedTime: string;
  handovers: { total: number; done: number };
  returns: { total: number; done: number };
  /** Open jobs of today, earliest first (late ones included: they are still to do). */
  jobs: GlanceJob[];
  labels: GlanceLabels;
  texts: GlanceTexts;
};

export type Translate = (key: string, params?: Record<string, unknown>) => string;

export type SummaryInput = {
  overview: Overview;
  org: string;
  branch?: string | null;
  now: number;
  /** "14:30" for an ISO instant, in the organization zone. */
  time: (iso: string) => string;
  /** `YYYY-MM-DD` of an instant in the organization zone. */
  date: (at: Date) => string;
  /** Heading for a `YYYY-MM-DD` day. */
  day: (date: string) => string;
  t: Translate;
};

/**
 * "Ayşe Yılmaz" → "AY", "ali" → "A", "Çağrı Öz Şen" → "ÇŞ" (first and last
 * word, Turkish upper case). Empty for a blank name.
 */
export function initials(name: string | null | undefined) {
  const words = (name ?? '')
    .trim()
    .split(/\s+/)
    .filter((w) => /\p{L}/u.test(w));
  if (!words.length) return '';
  const first = [...words[0]].find((c) => /\p{L}/u.test(c)) ?? '';
  const last = words.length > 1 ? ([...words[words.length - 1]].find((c) => /\p{L}/u.test(c)) ?? '') : '';
  return `${first}${last}`.toLocaleUpperCase('tr-TR');
}

export function labels(t: Translate): GlanceLabels {
  return {
    title: t('title'),
    handovers: t('handovers'),
    returns: t('returns'),
    next: t('next'),
    none: t('none'),
    late: t('late'),
    handover: t('type.handover'),
    return: t('type.return'),
    signedOut: t('signed_out'),
    noAccess: t('no_access'),
    stale: t('stale'),
    updated: t('updated'),
  };
}

function texts(t: Translate, counts?: { h: TodaySummary['handovers']; r: TodaySummary['returns'] }, updated = '') {
  return {
    summary: counts
      ? t('say.summary', {
          handovers: counts.h.total,
          handoversDone: counts.h.done,
          returns: counts.r.total,
          returnsDone: counts.r.done,
        })
      : '',
    nextIntro: t('say.next'),
    noNext: t('say.no_next'),
    stale: t('say.stale'),
    signedOut: t('say.signed_out'),
    noAccess: t('say.no_access'),
    updated: updated ? t('say.updated', { time: updated }) : '',
  };
}

function job(item: OperationItem, input: SummaryInput): GlanceJob {
  const time = input.time(item.due_at);
  const who = initials(item.customer_name);
  return {
    id: item.rental.uuid,
    type: item.task_type,
    at: new Date(item.due_at).getTime(),
    time,
    plate: item.plate,
    initials: who,
    say: input.t(who ? `say.job_${item.task_type}` : `say.job_${item.task_type}_anon`, {
      time,
      plate: item.plate,
      initials: who,
    }),
  };
}

/**
 * The summary from `GET /v1/tenant/overview`: the same counts as the Today
 * screen's "Bugünkü teslimler / iadeler" sections and its open jobs. Without
 * `tenant.field_tasks.read`-backed `today_operations` the state is `noAccess`.
 */
export function buildTodaySummary(input: SummaryInput): TodaySummary {
  const { overview, now, t } = input;
  const ops = overview.today_operations;
  const updatedTime = input.time(new Date(now).toISOString());
  const date = input.date(new Date(overview.today.start));
  const base = {
    v: SUMMARY_VERSION,
    org: input.org,
    branch: input.branch ?? '',
    date,
    day: input.day(date),
    dayEnd: new Date(overview.today.end).getTime(),
    updatedAt: now,
    updatedTime,
    labels: labels(t),
  } as const;
  if (!ops) {
    return {
      ...base,
      state: 'noAccess',
      handovers: { total: 0, done: 0 },
      returns: { total: 0, done: 0 },
      jobs: [],
      texts: texts(t, undefined, updatedTime),
    };
  }
  const h = { total: ops.handovers.total, done: ops.handovers.done };
  const r = { total: ops.returns.total, done: ops.returns.done };
  const jobs = ops.items
    .filter((i) => i.status !== 'completed')
    .sort((a, b) => a.due_at.localeCompare(b.due_at) || a.uuid.localeCompare(b.uuid))
    .slice(0, MAX_JOBS)
    .map((i) => job(i, input));
  return { ...base, state: 'ok', handovers: h, returns: r, jobs, texts: texts(t, { h, r }, updatedTime) };
}

/** Nothing of the account stays on the Home Screen or with Siri after sign-out. */
export function signedOutSummary(t: Translate, now: number): TodaySummary {
  return {
    v: SUMMARY_VERSION,
    state: 'signedOut',
    org: '',
    branch: '',
    date: '',
    day: '',
    dayEnd: 0,
    updatedAt: now,
    updatedTime: '',
    handovers: { total: 0, done: 0 },
    returns: { total: 0, done: 0 },
    jobs: [],
    labels: labels(t),
    texts: texts(t),
  };
}

/** The first open job (late or not): what the widget and "next job" show. */
export function nextJob(summary: TodaySummary): GlanceJob | undefined {
  return summary.state === 'ok' ? summary.jobs[0] : undefined;
}

/**
 * The compact JSON written to the App Group. Equal summaries (apart from the
 * write time) give the same `key`, so an unchanged board does not spend the
 * widget's reload budget.
 */
export function serializeSummary(summary: TodaySummary) {
  const { updatedAt: _at, updatedTime: _time, texts: _texts, ...comparable } = summary;
  return { json: JSON.stringify(summary), key: JSON.stringify(comparable) };
}

export type TimelineEntry = { date: Date; props: TodaySummary };

/**
 * Widget timeline: an entry now, then every 15 minutes and at each job's due
 * time until the day ends, and one at the day's end (the widget then says the
 * numbers are yesterday's). WidgetKit asks again after the last entry
 * (`.atEnd`), and every app write replaces the timeline and reloads it. The
 * widget derives "late" and the stale state from each entry's date.
 */
export function buildTimeline(summary: TodaySummary, now: number, step = TIMELINE_STEP_MS): TimelineEntry[] {
  if (summary.state !== 'ok' || !(summary.dayEnd > now)) return [{ date: new Date(now), props: summary }];
  const times = new Set<number>([now]);
  for (let at = now + step; at < summary.dayEnd; at += step) times.add(at);
  for (const j of summary.jobs) if (j.at > now && j.at < summary.dayEnd) times.add(j.at);
  times.add(summary.dayEnd);
  return [...times].sort((a, b) => a - b).map((at) => ({ date: new Date(at), props: summary }));
}

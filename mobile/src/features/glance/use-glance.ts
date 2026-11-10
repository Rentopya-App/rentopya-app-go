import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { useSession } from '@/core/auth/session';
import { DEFAULT_TIME_ZONE, formatDay, formatTime, localDate } from '@/core/format';
import { i18n } from '@/core/i18n';
import type { TenantOverview } from '@/features/today/today-model';

import { buildTodaySummary, signedOutSummary, type Translate } from './summary';
import { clearSummary, glanceAvailable, writeSummary } from './writer';

/** "Today" is the organization's Istanbul day on the API, as on the Today screen. */
const ZONE = DEFAULT_TIME_ZONE;

const t: Translate = (key, params) => i18n.t(key, { ns: 'glance', ...params });

/**
 * Called by the Today screen: every time `/v1/tenant/overview` loads (mount,
 * focus, pull, the 5 minute poll, another branch, another language) the
 * widget and Siri get the new summary. Adds no request.
 */
export function useTodayGlance(overview: TenantOverview | undefined, branch: string | null) {
  const org = useSession((s) => s.organization);
  const { i18n: lang } = useTranslation();
  useEffect(() => {
    if (!overview || !org || !glanceAvailable()) return;
    const now = Date.now();
    writeSummary(
      buildTodaySummary({
        overview,
        org: org.name,
        branch,
        now,
        time: (iso) => formatTime(iso, ZONE),
        date: (at) => localDate(at, ZONE),
        day: formatDay,
        t,
      }),
      now,
    );
  }, [overview, org, branch, lang.language]);
}

/**
 * Root shell: nothing of an account outlives its session on the Home Screen
 * or with Siri. Signing out, or switching organization, clears the summary
 * until the Today screen writes the new one.
 */
export function useGlanceSessionGuard() {
  useEffect(() => {
    if (!glanceAvailable()) return;
    const initial = useSession.getState();
    if (initial.status === 'signedOut') clearSummary(signedOutSummary(t, Date.now()));
    return useSession.subscribe((s, prev) => {
      const signedOut = s.status === 'signedOut' && prev.status !== 'signedOut';
      // Hydration (loading → signed in) keeps the summary; a change of organization or a lost one clears it.
      const switched = prev.status === 'signedIn' && prev.organization?.uuid !== s.organization?.uuid;
      if (signedOut || switched) clearSummary(signedOutSummary(t, Date.now()));
    });
  }, []);
}

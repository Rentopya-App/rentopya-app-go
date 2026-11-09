import { addNetworkStateListener, getNetworkStateAsync, type NetworkState } from 'expo-network';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { useSession } from '@/core/auth/session';

import { countsOf, isPending } from './machine';
import { kick, retryFailed, setOnline, useQueueStore, wakeAll } from './queue';

function reachable(s: NetworkState) {
  // `isInternetReachable` is unknown (undefined) for a moment after a change; trust `isConnected` then.
  return s.isConnected !== false && s.isInternetReachable !== false;
}

/**
 * Runs the upload worker while signed in: on launch, when the app returns to
 * the foreground and when the connection comes back. Mounted once in the
 * signed-in shell.
 */
export function useUploadWorker() {
  const user = useSession((s) => (s.status === 'signedIn' ? (s.me?.user.uuid ?? null) : null));
  useEffect(() => {
    if (!user) return;
    kick();
    void getNetworkStateAsync()
      .then((s) => setOnline(reachable(s)))
      .catch(() => undefined);
    const net = addNetworkStateListener((s) => setOnline(reachable(s)));
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') wakeAll();
    });
    return () => {
      net.remove();
      app.remove();
    };
  }, [user]);
}

/** This user's jobs: of one inspection, or (`inspectionUuid` undefined) every waiting or failed one. */
function useMyJobs(inspectionUuid?: string | null) {
  const user = useSession((s) => s.me?.user.uuid ?? null);
  return useQueueStore(
    useShallow((s) =>
      s.jobs.filter(
        (j) =>
          j.userUuid === user &&
          (inspectionUuid === undefined ? isPending(j) || j.state === 'failed' : j.inspectionUuid === inspectionUuid),
      ),
    ),
  );
}

/** Queue state of one inspection: pending / failed counts, the jobs, and a retry for its failed ones. */
export function useUploadQueue(inspectionUuid: string | null | undefined) {
  const jobs = useMyJobs(inspectionUuid ?? null);
  const activeId = useQueueStore((s) => s.activeId);
  const online = useQueueStore((s) => s.online);
  const counts = countsOf(jobs);
  return {
    ...counts,
    jobs,
    online,
    uploading: !!activeId && jobs.some((j) => j.id === activeId),
    retryFailed: () => retryFailed(inspectionUuid ?? undefined),
  };
}

/** Badge of the "Yükleme kuyruğu" entry: everything of this user still waiting or failed. */
export function useUploadQueueBadge() {
  const jobs = useMyJobs();
  return { ...countsOf(jobs), total: jobs.length };
}

/** All of this user's queued and failed jobs, oldest first (the status sheet). */
export function useUploadJobs() {
  const jobs = useMyJobs();
  return [...jobs].sort((a, b) => a.seq - b.seq);
}

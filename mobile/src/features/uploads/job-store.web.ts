import { readJSON, writeJSON } from '@/core/storage';

import type { UploadJob } from './machine';

/** Web preview: expo-sqlite needs SharedArrayBuffer in a browser tab, so jobs live in localStorage. */
const KEY = 'uploads.jobs';

function all() {
  return readJSON<Record<string, UploadJob>>(KEY) ?? {};
}

export async function loadJobs(): Promise<UploadJob[]> {
  return Object.values(all()).sort((a, b) => a.seq - b.seq);
}

export async function saveJob(job: UploadJob) {
  writeJSON(KEY, { ...all(), [job.id]: job });
}

export async function deleteJob(id: string) {
  const { [id]: _gone, ...rest } = all();
  writeJSON(KEY, rest);
}

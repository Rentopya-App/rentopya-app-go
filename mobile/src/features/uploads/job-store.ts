import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import type { UploadJob } from './machine';

/**
 * Upload jobs on the device (expo-sqlite, `uploads.db`): one row per job, the
 * job as JSON. Written before every request, so a killed app resumes where it
 * stopped. `job-store.web.ts` keeps the same API on localStorage.
 */
let db: Promise<SQLiteDatabase> | null = null;

function open() {
  db ??= (async () => {
    const d = await openDatabaseAsync('uploads.db');
    await d.execAsync(
      'PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS upload_jobs (id TEXT PRIMARY KEY NOT NULL, seq INTEGER NOT NULL, data TEXT NOT NULL);',
    );
    return d;
  })();
  return db;
}

export async function loadJobs(): Promise<UploadJob[]> {
  const d = await open();
  const rows = await d.getAllAsync<{ data: string }>('SELECT data FROM upload_jobs ORDER BY seq');
  const out: UploadJob[] = [];
  for (const r of rows) {
    try {
      out.push(JSON.parse(r.data) as UploadJob);
    } catch {
      // A row this version cannot read is skipped, never fatal.
    }
  }
  return out;
}

export async function saveJob(job: UploadJob) {
  const d = await open();
  await d.runAsync(
    'INSERT OR REPLACE INTO upload_jobs (id, seq, data) VALUES (?, ?, ?)',
    job.id,
    job.seq,
    JSON.stringify(job),
  );
}

export async function deleteJob(id: string) {
  const d = await open();
  await d.runAsync('DELETE FROM upload_jobs WHERE id = ?', id);
}

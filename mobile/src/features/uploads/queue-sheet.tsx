import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, Platform, Pressable, View } from 'react-native';

import { errorMessage } from '@/core/i18n';
import { formatTime } from '@/core/format';
import { Button } from '@/ui/button';
import { EmptyState } from '@/ui/empty-state';
import { Icon } from '@/ui/icon';
import { List, SectionHeader } from '@/ui/list';
import { Screen } from '@/ui/screen';
import { StatusPill, type StatusTone } from '@/ui/status-pill';
import { Text } from '@/ui/text';

import { useUploadJobs, useUploadQueueBadge } from './hooks';
import type { PhotoMeta, SignatureMeta, UploadJob } from './machine';
import { removeJob, retryFailed, useQueueStore } from './queue';

type T = (key: string, opts?: Record<string, unknown>) => string;

function title(job: UploadJob, t: T) {
  if (job.kind === 'signature') {
    const m = job.meta as SignatureMeta;
    return m.label ?? `${t('kind_signature')} · ${m.signerName}`;
  }
  const m = job.meta as PhotoMeta;
  if (m.label) return m.label;
  if (m.slot === 'damage') return t('slot_damage');
  if (m.slot === 'extra') return t('slot_extra');
  return `${t('kind_photo')} · ${m.slot}`;
}

function status(job: UploadJob, active: boolean, t: T): { label: string; tone: StatusTone } {
  if (job.state === 'failed') return { label: t('state_failed'), tone: 'problem' };
  if (active) return { label: t('state_sending'), tone: 'progress' };
  if (job.networkRetries > 0) return { label: t('state_waiting'), tone: 'neutral' };
  if (job.state === 'announced') return { label: t('state_announced'), tone: 'progress' };
  if (job.state === 'uploaded') return { label: t('state_uploaded'), tone: 'progress' };
  return { label: t('state_queued'), tone: 'neutral' };
}

function errorText(job: UploadJob, t: T) {
  if (!job.lastErrorCode) return null;
  if (job.lastErrorCode === 'FILE_MISSING') return t('error_file_missing');
  if (job.lastErrorCode === 'TOO_LARGE') return t('error_too_large');
  return errorMessage(job.lastErrorCode, t('error_generic'));
}

function confirmRemove(job: UploadJob, t: T) {
  const run = () => void removeJob(job.id);
  if (Platform.OS === 'web') return run();
  Alert.alert(t('remove_confirm_title'), t('remove_confirm_body'), [
    { text: t('common:cancel'), style: 'cancel' },
    { text: t('remove'), style: 'destructive', onPress: run },
  ]);
}

function JobRow({ job, active, last, t }: { job: UploadJob; active: boolean; last: boolean; t: T }) {
  const s = status(job, active, t);
  const err = errorText(job, t);
  // Only a job that failed before waits for a later try.
  const waiting = job.state !== 'failed' && !active && (job.attempts > 0 || job.networkRetries > 0);
  return (
    <View className={last ? 'gap-1.5 px-4 py-3' : 'gap-1.5 border-b border-border px-4 py-3'}>
      <View className="flex-row items-center gap-3">
        <Icon name={job.kind === 'signature' ? 'edit' : 'inbox'} tone="primary" size={20} />
        <Text variant="body" className="flex-1" numberOfLines={1}>
          {title(job, t)}
        </Text>
        {!active ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('remove')}
            hitSlop={10}
            onPress={() => confirmRemove(job, t)}>
            <Icon name="trash" tone="muted-foreground" size={18} />
          </Pressable>
        ) : null}
      </View>
      <View className="flex-row flex-wrap items-center gap-2 pl-8">
        <StatusPill label={s.label} tone={s.tone} />
        {job.attempts > 0 ? (
          <Text variant="footnote" tone="muted">
            {t('attempts', { count: job.attempts })}
          </Text>
        ) : null}
        {waiting ? (
          <Text variant="footnote" tone="muted">
            {t('next_try', { time: formatTime(new Date(job.nextAttemptAt).toISOString()) })}
          </Text>
        ) : null}
      </View>
      {err && (job.state === 'failed' || job.attempts > 0) ? (
        <Text variant="footnote" tone={job.state === 'failed' ? 'danger' : 'muted'} className="pl-8">
          {err}
        </Text>
      ) : null}
    </View>
  );
}

/** "Yükleme kuyruğu": what is still waiting on this device, what failed, and a retry. */
export function UploadQueueSheet() {
  const { t } = useTranslation('uploads');
  const jobs = useUploadJobs();
  const counts = useUploadQueueBadge();
  const activeId = useQueueStore((s) => s.activeId);
  const online = useQueueStore((s) => s.online);

  return (
    <>
      <Stack.Screen options={{ title: t('title'), presentation: 'formSheet', headerLargeTitle: false }} />
      <Screen>
        <View className="gap-2 pt-2">
          <View className="flex-row flex-wrap gap-2">
            <StatusPill
              label={t('summary_pending', { count: counts.pending })}
              tone={counts.pending ? 'progress' : 'done'}
            />
            {counts.failed ? <StatusPill label={t('summary_failed', { count: counts.failed })} tone="problem" /> : null}
          </View>
          <View className="flex-row items-start gap-2">
            {!online ? <Icon name="offline" tone="muted-foreground" size={16} /> : null}
            <Text variant="footnote" tone="muted" className="flex-1">
              {online ? t('online_hint') : t('offline')}
            </Text>
          </View>
        </View>
        {counts.failed ? <Button icon="refresh" title={t('retry_all')} onPress={() => void retryFailed()} /> : null}
        {jobs.length === 0 ? (
          <EmptyState icon="check" title={t('empty_title')} body={t('empty_body')} />
        ) : (
          <View>
            <SectionHeader title={t('title')} />
            <List>
              {jobs.map((j, i) => (
                <JobRow key={j.id} job={j} active={j.id === activeId} last={i === jobs.length - 1} t={t} />
              ))}
            </List>
          </View>
        )}
      </Screen>
    </>
  );
}

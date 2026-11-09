import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ListRow } from '@/ui/list';
import { StatusPill } from '@/ui/status-pill';

import { useUploadQueueBadge } from './hooks';

/** Menu entry of the upload queue with its badge (waiting / failed). */
export function UploadQueueRow() {
  const { t } = useTranslation('uploads');
  const { pending, failed } = useUploadQueueBadge();
  const parts = [
    pending ? t('menu_hint_pending', { count: pending }) : null,
    failed ? t('menu_hint_failed', { count: failed }) : null,
  ].filter(Boolean);
  const subtitle = parts.length ? parts.join(' · ') : t('menu_hint_empty');
  return (
    <ListRow
      icon="inbox"
      title={t('menu_row')}
      subtitle={subtitle}
      trailing={
        failed || pending ? (
          <StatusPill label={String(failed + pending)} tone={failed ? 'problem' : 'progress'} />
        ) : undefined
      }
      onPress={() => router.push('/upload-queue')}
    />
  );
}

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking } from 'react-native';

import { ListRow } from '@/ui/list';
import { Text } from '@/ui/text';

import { refreshPermission, registerPush, usePushPermission } from './push';

/** Menu row: whether this phone gets pushes, and the way to turn them on. Hidden where pushes cannot work. */
export function PushSettingsRow() {
  const { t } = useTranslation('push');
  const status = usePushPermission((s) => s.status);
  useEffect(() => {
    void refreshPermission(false);
  }, []);
  if (status === 'unavailable') return null;
  const onPress =
    status === 'denied'
      ? () => void Linking.openSettings()
      : status === 'undetermined'
        ? () => void registerPush()
        : undefined;
  return (
    <ListRow
      icon="bell"
      title={t('row_title')}
      subtitle={status === 'granted' ? t('on') : status === 'denied' ? t('denied') : t('ask_hint')}
      trailing={
        onPress ? (
          <Text variant="callout" tone="primary">
            {status === 'denied' ? t('open_settings') : t('allow')}
          </Text>
        ) : undefined
      }
      onPress={onPress}
    />
  );
}

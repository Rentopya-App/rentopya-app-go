import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { formatDay, localDate } from '@/core/format';
import { EmptyState } from '@/ui/empty-state';
import { List, ListRow } from '@/ui/list';
import { Screen } from '@/ui/screen';
import { StatusPill } from '@/ui/status-pill';
import { Text } from '@/ui/text';

/**
 * Home tab placeholder. The real board (today's pick-ups and returns, fleet
 * state) comes from one summary endpoint once the API client lands; the rows
 * here show the layout it will fill.
 */
export function HomeScreen() {
  const { t } = useTranslation('home');
  return (
    <>
      <Stack.Screen options={{ title: t('title') }} />
      <Screen>
        <View className="gap-0.5 px-1">
          <Text variant="title">{t('greeting')}</Text>
          <Text variant="callout" tone="muted">
            {formatDay(localDate(new Date()))}
          </Text>
        </View>
        <List>
          <ListRow icon="car" title={t('row_pickups')} trailing={<StatusPill label={t('soon')} />} />
          <ListRow icon="calendar" title={t('row_returns')} trailing={<StatusPill label={t('soon')} />} />
          <ListRow icon="building" title={t('row_fleet')} trailing={<StatusPill label={t('soon')} />} last />
        </List>
        <EmptyState icon="inbox" title={t('coming_title')} body={t('coming_body')} />
      </Screen>
    </>
  );
}

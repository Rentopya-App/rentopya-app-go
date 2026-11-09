import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Permission, useCan } from '@/core/auth/permissions';
import { List, ListRow } from '@/ui/list';

/**
 * "Rezervasyonlar" in the menu's module list (`tenant.reservations.read`);
 * the list screen links the approval queue, requests, quotes and tasks.
 */
export function ReservationsMenuEntry() {
  const { t } = useTranslation('reservations_app');
  const can = useCan();
  if (!can(Permission.TenantReservationsRead)) return null;
  return (
    <List>
      <ListRow
        icon="calendar"
        title={t('reservations:title')}
        subtitle={t('menu_subtitle')}
        onPress={() => router.push('/reservations')}
        last
      />
    </List>
  );
}

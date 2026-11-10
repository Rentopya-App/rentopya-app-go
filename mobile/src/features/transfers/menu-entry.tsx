import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Permission, useCan } from '@/core/auth/permissions';
import { List, ListRow } from '@/ui/list';

/**
 * Fleet operations in the menu's module list, each row behind the panel's
 * permission: transfers, the field task board and the fleet calendar.
 */
export function TransfersMenuEntry() {
  const { t } = useTranslation('transfers_app');
  const can = useCan();
  const rows = [
    can(Permission.TenantTransfersRead) && {
      key: 'transfers',
      icon: 'car' as const,
      title: t('transfers:title'),
      subtitle: t('menu.transfers'),
      href: '/transfers',
    },
    can(Permission.TenantFieldTasksRead) && {
      key: 'board',
      icon: 'customers' as const,
      title: t('board.title'),
      subtitle: t('menu.board'),
      href: '/field/board',
    },
    can(Permission.TenantVehiclesRead) && {
      key: 'calendar',
      icon: 'calendar' as const,
      title: t('fleet_calendar:title'),
      subtitle: t('menu.calendar'),
      href: '/fleet/calendar',
    },
  ].filter((r) => !!r);
  if (rows.length === 0) return null;
  return (
    <List>
      {rows.map((r, i) => (
        <ListRow
          key={r.key}
          icon={r.icon}
          title={r.title}
          subtitle={r.subtitle}
          onPress={() => router.push(r.href as Href)}
          last={i === rows.length - 1}
        />
      ))}
    </List>
  );
}

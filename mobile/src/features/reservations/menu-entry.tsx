import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Permission, useCan } from '@/core/auth/permissions';
import { List, ListRow } from '@/ui/list';

/**
 * "Rezervasyonlar" in the menu's module list (`tenant.reservations.read`);
 * the list screen links the approval queue, requests, quotes and tasks.
 * "Yeni rezervasyon" (`tenant.reservations.write`) and "Müsaitlik"
 * (`tenant.availability.read`) open the quick reservation flow.
 */
export function ReservationsMenuEntry() {
  const { t } = useTranslation('reservations_app');
  const can = useCan();
  const rows = [
    can(Permission.TenantReservationsRead) && {
      key: 'list',
      icon: 'calendar' as const,
      title: t('reservations:title'),
      subtitle: t('menu_subtitle'),
      href: '/reservations' as const,
    },
    can(Permission.TenantReservationsWrite) && {
      key: 'new',
      icon: 'add' as const,
      title: t('quick_reservation:menu.new'),
      subtitle: t('quick_reservation:menu.new_subtitle'),
      href: '/reservations/new' as const,
    },
    can(Permission.TenantAvailabilityRead) && {
      key: 'availability',
      icon: 'car' as const,
      title: t('quick_reservation:menu.availability'),
      subtitle: t('quick_reservation:menu.availability_subtitle'),
      href: '/availability' as const,
    },
  ].filter((r) => !!r);
  if (!rows.length) return null;
  return (
    <List>
      {rows.map((r, i) => (
        <ListRow
          key={r.key}
          icon={r.icon}
          title={r.title}
          subtitle={r.subtitle}
          onPress={() => router.push(r.href)}
          last={i === rows.length - 1}
        />
      ))}
    </List>
  );
}

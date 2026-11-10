import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Permission, useCan } from '@/core/auth/permissions';
import { List, ListRow } from '@/ui/list';

/**
 * Fleet operations in the menu's module list: "Operasyon özeti" and
 * "Yaklaşan bakımlar" (`tenant.vehicles.read`), "Giderler"
 * (`tenant.finance.expenses.read`).
 */
export function FleetOpsMenuEntry() {
  const { t } = useTranslation(['fleet_ops_app', 'vehicle_records', 'finance']);
  const can = useCan();
  const rows = [
    can(Permission.TenantVehiclesRead) && {
      key: 'alerts',
      icon: 'bell' as const,
      title: t('vehicle_records:alerts.title'),
      subtitle: t('menu_alerts'),
      href: '/fleet/alerts' as const,
    },
    can(Permission.TenantVehiclesRead) && {
      key: 'maintenance',
      icon: 'wrench' as const,
      title: t('upcoming_title'),
      subtitle: t('menu_maintenance'),
      href: '/fleet/maintenance' as const,
    },
    can(Permission.TenantFinanceExpensesRead) && {
      key: 'expenses',
      icon: 'wallet' as const,
      title: t('finance:expenses.title'),
      subtitle: t('menu_expenses'),
      href: '/finance/expenses' as const,
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

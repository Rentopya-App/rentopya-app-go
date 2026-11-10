import { router, Stack, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Permission, useCan, type PermissionSlug } from '@/core/auth/permissions';
import { useHasFeature } from '@/core/tenant';
import type { components } from '@/core/api/schema';
import type { IconName } from '@/ui/icons';
import { EmptyState } from '@/ui/empty-state';
import { List, ListRow, SectionHeader } from '@/ui/list';
import { Screen } from '@/ui/screen';

type Feature = components['schemas']['FeatureKey'];

type Entry = { key: string; icon: IconName; href: Href; perm: PermissionSlug; feature?: Feature };

/** Same groups, slugs and plan features as the panel's "Ayarlar" sidebar section. */
const GROUPS: { key: string; items: Entry[] }[] = [
  {
    key: 'organization',
    items: [
      { key: 'general', icon: 'building', href: '/settings/organization', perm: Permission.TenantSettingsRead },
      { key: 'members', icon: 'customers', href: '/settings/members', perm: Permission.TenantMembersRead },
      { key: 'roles', icon: 'security', href: '/settings/roles', perm: Permission.TenantRolesRead },
      {
        key: 'support',
        icon: 'info',
        href: '/settings/support-access',
        perm: Permission.TenantSupportAccessManage,
      },
    ],
  },
  {
    key: 'communication',
    items: [
      {
        key: 'notifications',
        icon: 'bell',
        href: '/settings/notifications',
        perm: Permission.TenantNotificationSettingsRead,
      },
      {
        key: 'whatsapp',
        icon: 'phone',
        href: '/settings/whatsapp',
        perm: Permission.TenantIntegrationsManage,
        feature: 'whatsapp',
      },
    ],
  },
  {
    key: 'documents',
    items: [
      {
        key: 'contract_templates',
        icon: 'document',
        href: '/settings/contract-templates',
        perm: Permission.TenantContractsRead,
      },
      {
        key: 'inspection_templates',
        icon: 'photos',
        href: '/settings/inspection-templates',
        perm: Permission.TenantRentalsRead,
      },
      {
        key: 'invoices',
        icon: 'card',
        href: '/settings/invoices',
        perm: Permission.TenantInvoicesSettings,
        feature: 'einvoice',
      },
    ],
  },
  {
    key: 'connections',
    items: [
      {
        key: 'integrations',
        icon: 'wrench',
        href: '/settings/integrations',
        perm: Permission.TenantIntegrationsManage,
      },
      {
        key: 'public_api',
        icon: 'link',
        href: '/settings/public-api',
        perm: Permission.TenantPublicAPIRead,
        feature: 'public_api',
      },
    ],
  },
  {
    key: 'site',
    items: [
      { key: 'site', icon: 'language', href: '/settings/site', perm: Permission.TenantSiteRead, feature: 'site' },
      {
        key: 'site_articles',
        icon: 'edit',
        href: '/settings/site-articles',
        perm: Permission.TenantSiteRead,
        feature: 'site',
      },
      {
        key: 'site_leads',
        icon: 'inbox',
        href: '/settings/site-leads',
        perm: Permission.TenantSiteLeadsRead,
        feature: 'site',
      },
    ],
  },
];

/** Entries the member may open: the permission, and the plan feature where the panel needs one. */
export function useSettingsEntries() {
  const can = useCan();
  const has = useHasFeature();
  return GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => can(i.perm) && (!i.feature || has(i.feature))),
  })).filter((g) => g.items.length);
}

/** "Ayarlar" of the company panel: one row per settings page the member may open. */
export function SettingsHubScreen() {
  const { t } = useTranslation('settings_app');
  const groups = useSettingsEntries();
  return (
    <>
      <Stack.Screen options={{ title: t('title') }} />
      <Screen>
        {!groups.length ? <EmptyState icon="security" title={t('common:forbidden')} /> : null}
        {groups.map((g) => (
          <View key={g.key}>
            <SectionHeader title={t(`groups.${g.key}`)} />
            <List>
              {g.items.map((i, idx) => (
                <ListRow
                  key={i.key}
                  icon={i.icon}
                  title={t(`pages.${i.key}`)}
                  subtitle={t(`pages.${i.key}_hint`)}
                  onPress={() => router.push(i.href)}
                  last={idx === g.items.length - 1}
                />
              ))}
            </List>
          </View>
        ))}
      </Screen>
    </>
  );
}

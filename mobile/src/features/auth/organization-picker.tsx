import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { isUsable } from '@/core/auth/organization';
import { useSession } from '@/core/auth/session';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { EmptyState } from '@/ui/empty-state';
import { Icon } from '@/ui/icon';
import { List, ListRow } from '@/ui/list';
import { Screen } from '@/ui/screen';
import { Text } from '@/ui/text';

/**
 * Picks the organization every `/v1/tenant/*` call is made for (sent as
 * `X-Organization: <slug>`, as the panel does). Shown on its own after
 * sign-in when the account has several memberships (or none), after a
 * membership stopped working, and as a sheet from the menu to switch. The
 * choice is remembered on the device.
 */
export function OrganizationPicker() {
  const { t } = useTranslation('auth');
  const me = useSession((s) => s.me);
  const current = useSession((s) => s.organization);
  const lost = useSession((s) => s.lostOrganization);
  const orgs = me?.organizations ?? [];

  const pick = (slug: string) => {
    useSession.getState().selectOrganization(slug);
    // As a sheet from the menu: close it. After sign-in: open the company panel.
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  return (
    <Screen className="pt-6">
      {lost && !current ? (
        <Card>
          <Text tone="muted">{t('org_lost', { name: lost.name })}</Text>
        </Card>
      ) : null}
      {orgs.length === 0 ? (
        <EmptyState icon="building" title={t('no_org_title')} body={t('no_org_body')} />
      ) : (
        <>
          <View className="gap-1 px-1">
            <Text variant="title">{t('pick_org_title')}</Text>
            <Text variant="callout" tone="muted">
              {t('pick_org_body')}
            </Text>
          </View>
          <List>
            {orgs.map((o, i) => {
              const usable = isUsable(o);
              const state = o.status !== 'active' ? t('org_suspended') : !usable ? t('org_expired') : null;
              return (
                <ListRow
                  key={o.uuid}
                  icon="building"
                  title={o.name}
                  subtitle={state ? `${o.role.name} · ${state}` : o.role.name}
                  trailing={current?.uuid === o.uuid ? <Icon name="check" tone="primary" size={18} /> : undefined}
                  onPress={usable ? () => pick(o.slug) : undefined}
                  last={i === orgs.length - 1}
                />
              );
            })}
          </List>
        </>
      )}
      {current ? null : (
        <Button
          icon="signOut"
          title={t('sign_out')}
          variant="ghost"
          onPress={() => void useSession.getState().signOut()}
        />
      )}
    </Screen>
  );
}

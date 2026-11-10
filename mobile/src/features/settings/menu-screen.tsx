import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, Platform, View } from 'react-native';

import { useSession } from '@/core/auth/session';
import { APP_VERSION } from '@/core/config';
import { type Language, LANGUAGES, setLanguage } from '@/core/i18n';
import { type ThemePreference, usePreferences } from '@/core/preferences';
import { useSelectedBranch } from '@/core/tenant';
import { signOutGoogle } from '@/features/auth/social';
import { ReservationsMenuEntry } from '@/features/reservations/menu-entry';
import { NotificationCenterRow } from '@/features/notifications/bell';
import { FinanceMenuEntry } from '@/features/finance/menu-entry';
import { CustomersMenuRows } from '@/features/customers/menu-rows';
import { TransfersMenuEntry } from '@/features/transfers/menu-entry';
import { UploadQueueRow } from '@/features/uploads/queue-row';
import { PushSettingsRow } from '@/features/push/push-settings-row';
import { Chips } from '@/ui/chips';
import { List, ListRow, SectionHeader } from '@/ui/list';
import { Screen } from '@/ui/screen';
import { Select } from '@/ui/select';
import { Text } from '@/ui/text';

const ALL = '__all__';

/** Asks first; `/v1/auth/logout` revokes this device's refresh token, then the secure store is emptied. */
function confirmSignOut(t: (k: string) => string) {
  const run = () => {
    void signOutGoogle();
    void useSession.getState().signOut();
  };
  if (Platform.OS === 'web') {
    run();
    return;
  }
  Alert.alert(t('sign_out_confirm_title'), t('sign_out_confirm_body'), [
    { text: t('common:cancel'), style: 'cancel' },
    { text: t('sign_out'), style: 'destructive', onPress: run },
  ]);
}

/** Menu tab: the company and branch in use, the account, app preferences and the version. */
export function MenuScreen() {
  const { t, i18n } = useTranslation('settings');
  const theme = usePreferences((s) => s.theme);
  const setTheme = usePreferences((s) => s.setTheme);
  const me = useSession((s) => s.me);
  const organization = useSession((s) => s.organization);
  const branch = useSelectedBranch();
  const themes: { value: ThemePreference; label: string }[] = [
    { value: 'system', label: t('theme_system') },
    { value: 'light', label: t('theme_light') },
    { value: 'dark', label: t('theme_dark') },
  ];
  const several = (me?.organizations?.length ?? 0) > 1;

  return (
    <>
      <Stack.Screen options={{ title: t('title') }} />
      <Screen>
        {organization ? (
          <View>
            <SectionHeader title={t('section_company')} />
            <List>
              <ListRow
                icon="building"
                title={organization.name}
                subtitle={`${t('role')}: ${organization.role.name}`}
                trailing={
                  several ? (
                    <Text variant="callout" tone="primary">
                      {t('switch_organization')}
                    </Text>
                  ) : undefined
                }
                onPress={several ? () => router.push('/organizations') : undefined}
                last={!branch.available}
              />
              {branch.available ? (
                <View className="gap-2 px-4 py-3">
                  <Select
                    label={t('branch')}
                    icon="building"
                    value={branch.branchUuid ?? ALL}
                    searchable={branch.branches.length > 8}
                    options={[
                      { value: ALL, label: t('branch_all') },
                      ...branch.branches.map((b) => ({ value: b.uuid, label: b.name, description: b.code })),
                    ]}
                    onChange={(v) => branch.setBranch(v === ALL ? null : v)}
                  />
                  <Text variant="footnote" tone="muted">
                    {t('branch_hint')}
                  </Text>
                </View>
              ) : null}
            </List>
          </View>
        ) : null}
        <ReservationsMenuEntry />
        <FinanceMenuEntry />
        <CustomersMenuRows />
        <TransfersMenuEntry />
        <View>
          <SectionHeader title={t('section_account')} />
          <List>
            {me ? (
              <ListRow
                icon="user"
                title={`${me.user.name} ${me.user.surname}`.trim() || me.user.email}
                subtitle={me.user.email}
                onPress={() => router.push('/account')}
              />
            ) : null}
            <NotificationCenterRow />
            <UploadQueueRow />
            <ListRow icon="signOut" title={t('sign_out')} tone="danger" onPress={() => confirmSignOut(t)} last />
          </List>
        </View>
        <View>
          <SectionHeader title={t('section_app')} />
          <List>
            <PushSettingsRow />
            <View className="gap-2 border-b border-border px-4 py-3">
              <Text variant="footnote" tone="muted">
                {t('language')}
              </Text>
              <Chips<Language>
                options={LANGUAGES.map((l) => ({ value: l.code, label: l.name }))}
                value={i18n.language as Language}
                onChange={(l) => void setLanguage(l)}
              />
            </View>
            <View className="gap-2 px-4 py-3">
              <Text variant="footnote" tone="muted">
                {t('theme')}
              </Text>
              <Chips options={themes} value={theme} onChange={setTheme} />
            </View>
          </List>
        </View>
        <View>
          <SectionHeader title={t('section_about')} />
          <List>
            <ListRow
              icon="info"
              title={t('version')}
              trailing={
                <Text variant="callout" tone="muted">
                  {APP_VERSION}
                </Text>
              }
              last
            />
          </List>
        </View>
      </Screen>
    </>
  );
}

import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Can, Permission } from '@/core/auth/permissions';
import { useSession } from '@/core/auth/session';
import { apiErrorMessage } from '@/core/i18n';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { List, ListRow, SectionHeader } from '@/ui/list';
import { Screen } from '@/ui/screen';
import { StatusPill } from '@/ui/status-pill';
import { Text } from '@/ui/text';
import { toast } from '@/ui/toast';

import { usePasskeys, useRequestEmailVerify, useSessions, useTotpStatus } from './api';

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toLocaleUpperCase('tr'))
      .join('') || '?'
  );
}

/**
 * "Hesap ve güvenlik" (the panel's profile page): identity, profile,
 * sign-in security, sessions, notification preferences and account
 * deletion. Account-level: the same for every organization of the user.
 */
export function AccountScreen() {
  const { t } = useTranslation('account');
  const me = useSession((s) => s.me);
  const totp = useTotpStatus();
  const sessions = useSessions();
  const passkeys = usePasskeys();
  const verify = useRequestEmailVerify();
  const user = me?.user;
  const fullName = `${user?.name ?? ''} ${user?.surname ?? ''}`.trim();

  const requestVerify = () =>
    verify.mutate(user?.email ?? '', {
      onSuccess: () => toast.success(t('profile.verify_sent')),
      onError: (e) => toast.error(apiErrorMessage(e)),
    });

  return (
    <>
      <Stack.Screen options={{ title: t('title') }} />
      <Screen>
        <Card>
          <View className="flex-row items-center gap-4">
            <View className="size-14 items-center justify-center rounded-full bg-primary">
              <Text variant="headline" tone="onPrimary">
                {initials(fullName || user?.email || '')}
              </Text>
            </View>
            <View className="flex-1 gap-1">
              <Text variant="headline" numberOfLines={1}>
                {fullName || '—'}
              </Text>
              <Text variant="callout" tone="muted" numberOfLines={1}>
                {user?.email ?? '—'}
              </Text>
              <View className="flex-row">
                <StatusPill
                  label={user?.email_verified ? t('profile.verified') : t('profile.unverified')}
                  tone={user?.email_verified ? 'done' : 'problem'}
                />
              </View>
            </View>
          </View>
          {user && !user.email_verified ? (
            <Button
              title={t('profile.verify_request')}
              icon="mail"
              variant="outline"
              loading={verify.isPending}
              onPress={requestVerify}
            />
          ) : null}
        </Card>

        <View>
          <SectionHeader title={t('section.profile')} />
          <List>
            <ListRow
              icon="user"
              title={t('profile.edit_title')}
              subtitle={t('profile.edit_hint')}
              onPress={() => router.push('/account/profile')}
              last
            />
          </List>
        </View>

        <View>
          <SectionHeader title={t('section.security')} />
          <List>
            <ListRow
              icon="security"
              title={t('totp.title')}
              subtitle={
                totp.data ? (totp.data.enabled ? t('totp.status_on') : t('totp.status_off')) : t('totp.description')
              }
              trailing={
                totp.data ? (
                  <StatusPill
                    label={totp.data.enabled ? t('totp.status_on') : t('totp.status_off')}
                    tone={totp.data.enabled ? 'done' : 'neutral'}
                  />
                ) : undefined
              }
              onPress={() => router.push('/account/totp')}
            />
            <Can perm={Permission.AuthSession}>
              <ListRow
                icon="key"
                title={t('passkey.title')}
                subtitle={
                  passkeys.data ? t('passkey.count', { count: passkeys.data.length }) : t('passkey.description')
                }
                onPress={() => router.push('/account/passkeys')}
              />
            </Can>
            <ListRow
              icon="devices"
              title={t('sessions.title')}
              subtitle={
                sessions.data ? t('sessions.count', { count: sessions.data.length }) : t('sessions.description')
              }
              onPress={() => router.push('/account/sessions')}
              last
            />
          </List>
        </View>

        <Can perm={Permission.AuthSession}>
          <View>
            <SectionHeader title={t('section.web')} />
            <List>
              <ListRow
                icon="qr"
                title={t('qr_login:menu_row')}
                subtitle={t('qr_login:menu_hint')}
                onPress={() => router.push('/qr-scan')}
                last
              />
            </List>
          </View>
        </Can>

        <View>
          <SectionHeader title={t('section.notifications')} />
          <List>
            <ListRow
              icon="bell"
              title={t('preferences.title')}
              subtitle={t('preferences.description')}
              onPress={() => router.push('/account/notification-preferences')}
              last
            />
          </List>
        </View>

        <View>
          <SectionHeader title={t('section.danger')} />
          <List>
            <ListRow
              icon="trash"
              tone="danger"
              title={t('delete.title')}
              subtitle={t('delete.row_hint')}
              onPress={() => router.push('/account/delete')}
              last
            />
          </List>
        </View>
      </Screen>
    </>
  );
}

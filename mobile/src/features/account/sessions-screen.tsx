import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { RefreshControl, View } from 'react-native';

import { formatShort } from '@/core/format';
import { apiErrorMessage } from '@/core/i18n';
import { Button, IconButton } from '@/ui/button';
import { EmptyState } from '@/ui/empty-state';
import { Icon } from '@/ui/icon';
import { List } from '@/ui/list';
import { QueryState } from '@/ui/query-state';
import { Screen } from '@/ui/screen';
import { StatusPill } from '@/ui/status-pill';
import { Text } from '@/ui/text';
import { toast } from '@/ui/toast';

import { useRevokeOtherSessions, useRevokeSession, useSessions } from './api';
import { confirmAction } from './confirm';
import { describeUserAgent } from './lib';

type Session = NonNullable<ReturnType<typeof useSessions>['data']>[number];

function SessionRow({ s, last, onRevoke }: { s: Session; last: boolean; onRevoke: () => void }) {
  const { t } = useTranslation('account');
  const device = describeUserAgent(s.user_agent);
  return (
    <View className={last ? 'flex-row gap-3 px-4 py-3' : 'flex-row gap-3 border-b border-border px-4 py-3'}>
      <View className="size-10 items-center justify-center rounded-md bg-secondary">
        <Icon name={device.kind === 'app' || device.kind === 'mobile' ? 'phone' : 'devices'} tone="primary" size={20} />
      </View>
      <View className="flex-1 gap-1">
        <Text numberOfLines={2}>{device.label ?? t('sessions.unknown_device')}</Text>
        <View className="flex-row flex-wrap gap-1.5">
          {s.current ? <StatusPill label={t('sessions.current')} tone="done" /> : null}
          {s.impersonated ? <StatusPill label={t('sessions.impersonated')} tone="progress" /> : null}
        </View>
        {s.ip_address ? (
          <Text variant="footnote" tone="muted">
            {t('sessions.ip', { ip: s.ip_address })}
          </Text>
        ) : null}
        <Text variant="footnote" tone="muted">
          {t('sessions.created_at', { at: formatShort(s.created_at) })} ·{' '}
          {t('sessions.expires_at', { at: formatShort(s.expires_at) })}
        </Text>
      </View>
      {s.current ? null : <IconButton icon="signOut" label={t('sessions.revoke')} variant="ghost" onPress={onRevoke} />}
    </View>
  );
}

/** Signed-in devices (`/v1/auth/sessions`): sign one out, or every other one. */
export function SessionsScreen() {
  const { t } = useTranslation('account');
  const sessions = useSessions();
  const revoke = useRevokeSession();
  const revokeOthers = useRevokeOtherSessions();
  const others = (sessions.data ?? []).some((s) => !s.current);

  const askRevoke = async (s: Session) => {
    const ok = await confirmAction({
      title: t('sessions.revoke_title'),
      body: t('sessions.revoke_description'),
      action: t('sessions.revoke'),
      destructive: true,
    });
    if (!ok) return;
    revoke.mutate(s.uuid, {
      onSuccess: () => toast.success(t('sessions.revoke_success')),
      onError: (e) => toast.error(apiErrorMessage(e)),
    });
  };

  const askRevokeOthers = async () => {
    const ok = await confirmAction({
      title: t('sessions.revoke_others_title'),
      body: t('sessions.revoke_others_description'),
      action: t('sessions.revoke_others'),
      destructive: true,
    });
    if (!ok) return;
    revokeOthers.mutate(undefined, {
      onSuccess: () => toast.success(t('sessions.revoke_others_success')),
      onError: (e) => toast.error(apiErrorMessage(e)),
    });
  };

  return (
    <>
      <Stack.Screen options={{ title: t('sessions.title') }} />
      <Screen
        refreshControl={
          <RefreshControl refreshing={sessions.isRefetching} onRefresh={() => void sessions.refetch()} />
        }>
        <Text tone="muted" className="px-1">
          {t('sessions.description')}
        </Text>
        <QueryState query={sessions}>
          {(items) =>
            items.length === 0 ? (
              <EmptyState icon="devices" title={t('sessions.empty_title')} body={t('sessions.empty_body')} />
            ) : (
              <>
                <List>
                  {items.map((s, i) => (
                    <SessionRow key={s.uuid} s={s} last={i === items.length - 1} onRevoke={() => void askRevoke(s)} />
                  ))}
                </List>
                <Button
                  title={t('sessions.revoke_others')}
                  icon="signOut"
                  variant="outline"
                  disabled={!others}
                  loading={revokeOthers.isPending}
                  onPress={() => void askRevokeOthers()}
                />
              </>
            )
          }
        </QueryState>
      </Screen>
    </>
  );
}

import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { RefreshControl, View } from 'react-native';

import { formatShort } from '@/core/format';
import { apiErrorMessage } from '@/core/i18n';
import { IconButton } from '@/ui/button';
import { Card } from '@/ui/card';
import { EmptyState } from '@/ui/empty-state';
import { Icon } from '@/ui/icon';
import { List } from '@/ui/list';
import { QueryState } from '@/ui/query-state';
import { Screen } from '@/ui/screen';
import { StatusPill } from '@/ui/status-pill';
import { Text } from '@/ui/text';
import { toast } from '@/ui/toast';

import { useDeletePasskey, usePasskeys } from './api';
import { confirmAction } from './confirm';

/**
 * Registered passkeys (`/v1/auth/passkeys`): list and remove. Adding one
 * needs the browser's WebAuthn flow, so it stays in the panel for now.
 */
export function PasskeysScreen() {
  const { t } = useTranslation('account');
  const passkeys = usePasskeys();
  const remove = useDeletePasskey();

  const ask = async (uuid: string, name: string) => {
    const ok = await confirmAction({
      title: t('passkey.delete_title'),
      body: t('passkey.delete_description', { name }),
      action: t('passkey.delete'),
      destructive: true,
    });
    if (!ok) return;
    remove.mutate(uuid, {
      onSuccess: () => toast.success(t('passkey.delete_success')),
      onError: (e) => toast.error(apiErrorMessage(e)),
    });
  };

  return (
    <>
      <Stack.Screen options={{ title: t('passkey.title') }} />
      <Screen
        refreshControl={
          <RefreshControl refreshing={passkeys.isRefetching} onRefresh={() => void passkeys.refetch()} />
        }>
        <Text tone="muted" className="px-1">
          {t('passkey.description')}
        </Text>
        <QueryState query={passkeys}>
          {(items) =>
            items.length === 0 ? (
              <EmptyState icon="key" title={t('passkey.empty_title')} body={t('passkey.empty_body')} />
            ) : (
              <List>
                {items.map((p, i) => {
                  const name = p.name?.trim() || t('passkey.unnamed');
                  return (
                    <View
                      key={p.uuid}
                      className={
                        i === items.length - 1
                          ? 'flex-row items-center gap-3 px-4 py-3'
                          : 'flex-row items-center gap-3 border-b border-border px-4 py-3'
                      }>
                      <Icon name="key" tone="primary" size={20} />
                      <View className="flex-1 gap-1">
                        <Text numberOfLines={1}>{name}</Text>
                        <View className="flex-row">
                          <StatusPill
                            label={p.backed_up ? t('passkey.backed_up') : t('passkey.device_only')}
                            tone="neutral"
                          />
                        </View>
                        <Text variant="footnote" tone="muted">
                          {t('passkey.created_at', { at: formatShort(p.created_at) })} ·{' '}
                          {p.last_used_at
                            ? t('passkey.last_used_at', { at: formatShort(p.last_used_at) })
                            : t('passkey.never_used')}
                        </Text>
                      </View>
                      <IconButton
                        icon="trash"
                        label={t('passkey.delete')}
                        variant="ghost"
                        onPress={() => void ask(p.uuid, name)}
                      />
                    </View>
                  );
                })}
              </List>
            )
          }
        </QueryState>
        <Card>
          <View className="flex-row gap-2">
            <Icon name="info" tone="muted-foreground" size={18} />
            <Text variant="callout" tone="muted" className="flex-1">
              {t('passkey.native_note')}
            </Text>
          </View>
        </Card>
      </Screen>
    </>
  );
}

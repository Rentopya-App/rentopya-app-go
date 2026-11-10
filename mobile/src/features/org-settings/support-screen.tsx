import { Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Permission } from '@/core/auth/permissions';
import { formatShort } from '@/core/format';
import { apiErrorMessage } from '@/core/i18n';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Chips } from '@/ui/chips';
import { TextArea } from '@/ui/fields';
import { PagedList } from '@/ui/paged-list';
import { Text } from '@/ui/text';
import { toast } from '@/ui/toast';

import { useOpenSupportGrant, useRevokeSupportGrant, useSupportGrants, type SupportGrant } from './api';
import { activeGrant, durationKey, fullName, SUPPORT_DURATIONS } from './lib';
import { confirmAction, Gate, Pill } from './parts';
import { StepUpHost } from './step-up';

type Scope = SupportGrant['scope'];

/** "Destek erişimi": open a time-boxed grant for platform support, see and revoke grants. */
export function SupportAccessScreen() {
  const { t } = useTranslation('support_access');
  return (
    <>
      <Stack.Screen options={{ title: t('title') }} />
      <StepUpHost />
      <Gate perm={Permission.TenantSupportAccessManage}>
        <Body />
      </Gate>
    </>
  );
}

function Body() {
  const { t } = useTranslation('support_access');
  const query = useSupportGrants();
  const revoke = useRevokeSupportGrant();
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const active = activeGrant(items);

  const doRevoke = async (g: SupportGrant) => {
    const ok = await confirmAction({
      title: t('revoke.title'),
      body: t('revoke.description'),
      action: t('actions.revoke'),
      cancel: t('common:cancel'),
      destructive: true,
    });
    if (!ok) return;
    revoke.mutate(g.uuid, {
      onSuccess: () => toast.success(t('toast.revoked')),
      onError: (e) => toast.error(apiErrorMessage(e)),
    });
  };

  return (
    <PagedList<SupportGrant>
      query={query}
      keyOf={(g) => g.uuid}
      empty={t('empty_title')}
      header={
        <>
          <Card>
            <Text variant="headline">
              {active ? t('banner.active_title', { scope: t(`scopes.${active.scope}`) }) : t('banner.none_title')}
            </Text>
            <Text tone="muted">
              {active ? t('banner.active_body', { date: formatShort(active.expires_at) }) : t('banner.none_body')}
            </Text>
          </Card>
          <OpenForm replacing={!!active} />
        </>
      }
      renderItem={(g) => (
        <View className="gap-1.5 border-b border-border px-4 py-3">
          <View className="flex-row items-center justify-between gap-2">
            <Text className="font-sans-semibold">{t(`scopes.${g.scope}`)}</Text>
            <Pill status={g.status} label={t(`statuses.${g.status}`)} />
          </View>
          <Text variant="footnote" tone="muted">
            {t('columns.expires_at')}: {formatShort(g.expires_at)}
            {g.created_by ? ` · ${t('columns.created_by')}: ${fullName(g.created_by)}` : ''}
          </Text>
          {g.note ? <Text variant="callout">{g.note}</Text> : null}
          {g.status === 'active' ? (
            <Button
              title={t('actions.revoke')}
              variant="ghost"
              icon="cancel"
              disabled={revoke.isPending}
              onPress={() => void doRevoke(g)}
            />
          ) : null}
        </View>
      )}
    />
  );
}

function OpenForm({ replacing }: { replacing: boolean }) {
  const { t } = useTranslation('support_access');
  const open = useOpenSupportGrant();
  const [scope, setScope] = useState<Scope>('read_only');
  const [hours, setHours] = useState<string>('4');
  const [note, setNote] = useState('');
  const tooLong = note.length > 500;

  const submit = async () => {
    if (tooLong) return;
    if (scope === 'full') {
      const ok = await confirmAction({
        title: t('open.title'),
        body: t('scopes.full_hint'),
        action: t('open.submit'),
        cancel: t('common:cancel'),
      });
      if (!ok) return;
    }
    open.mutate(
      { scope, duration_hours: Number(hours), note: note.trim() || undefined },
      {
        onSuccess: () => {
          toast.success(t('toast.opened'));
          setNote('');
        },
        onError: (e) => toast.error(apiErrorMessage(e)),
      },
    );
  };

  return (
    <Card title={t('open.title')}>
      <Text variant="footnote" tone="muted">
        {t('open.description')}
        {replacing ? ` ${t('open.description_replace')}` : ''}
      </Text>
      <Text variant="footnote" tone="muted">
        {t('fields.scope')}
      </Text>
      <Chips<Scope>
        options={(['read_only', 'full'] as const).map((s) => ({ value: s, label: t(`scopes.${s}`) }))}
        value={scope}
        onChange={setScope}
      />
      <Text variant="footnote" tone="muted">
        {t(`scopes.${scope}_hint`)}
      </Text>
      <Text variant="footnote" tone="muted">
        {t('fields.duration')}
      </Text>
      <Chips
        options={SUPPORT_DURATIONS.map((h) => ({ value: String(h), label: t(durationKey(h)) }))}
        value={hours}
        onChange={setHours}
      />
      <TextArea
        label={t('fields.note')}
        hint={t('fields.note_hint')}
        placeholder={t('fields.note_placeholder')}
        value={note}
        onChangeText={setNote}
        error={tooLong ? t('validation.note') : undefined}
      />
      <Button title={t('open.submit')} loading={open.isPending} onPress={() => void submit()} />
    </Card>
  );
}

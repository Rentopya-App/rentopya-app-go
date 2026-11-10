import * as Haptics from 'expo-haptics';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { type ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { isApiError } from '@/core/api/errors';
import { can } from '@/core/auth/can';
import { Permission } from '@/core/auth/permission-slugs';
import { useSession } from '@/core/auth/session';
import { formatShort } from '@/core/format';
import { apiErrorMessage } from '@/core/i18n';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { EmptyState } from '@/ui/empty-state';
import { Icon } from '@/ui/icon';
import { List, ListRow } from '@/ui/list';
import { Screen } from '@/ui/screen';
import { Skeleton } from '@/ui/skeleton';
import { Text } from '@/ui/text';
import { toast } from '@/ui/toast';

import { useQrDecision, useQrSession } from './api';
import { clientLabel, isQrSessionId, locationLabel, qrProblem, secondsLeft, type QrProblem } from './lib';

function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

function Problem({ problem }: { problem: QrProblem | 'invalid' | 'denied' }) {
  const { t } = useTranslation('qr_login');
  return (
    <EmptyState
      icon={problem === 'forbidden' || problem === 'denied' ? 'cancel' : 'qr'}
      title={t(`problem.${problem}_title`)}
      body={t(`problem.${problem}_body`)}
      action={{ title: t('common:close'), onPress: close }}
    />
  );
}

/**
 * Approve a web sign-in from the phone (`rentopya://login/qr/{id}` or the
 * scanner): who is asking (browser, system, IP, place), then Onayla /
 * Reddet. Approving signs that browser tab in as this user.
 */
export function QrApproveScreen() {
  const { t } = useTranslation('qr_login');
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const id = typeof raw === 'string' ? raw : '';
  const valid = isQrSessionId(id);
  const allowed = useSession((s) => can(s.me?.permissions, Permission.AuthSession));
  const details = useQrSession(valid && allowed ? id : '');
  const decide = useQrDecision(id);
  const [now, setNow] = useState(() => Date.now());
  const [result, setResult] = useState<'approved' | 'rejected' | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const left = details.data ? secondsLeft(details.data.expires_at, now) : null;
  const run = (decision: 'approve' | 'reject') =>
    decide.mutate(decision, {
      onSuccess: () => {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setResult(decision === 'approve' ? 'approved' : 'rejected');
        toast.success(t(decision === 'approve' ? 'approved_toast' : 'rejected_toast'));
      },
      onError: (e) => {
        const p = isApiError(e) ? qrProblem(e.code, e.status) : 'other';
        toast.error(p === 'other' ? apiErrorMessage(e) : t(`problem.${p}_title`));
        if (p !== 'other' && p !== 'rate_limited') void details.refetch();
      },
    });

  let body: ReactNode;
  if (!valid) body = <Problem problem="invalid" />;
  else if (!allowed) body = <Problem problem="denied" />;
  else if (result) {
    body = (
      <EmptyState
        icon={result === 'approved' ? 'check' : 'cancel'}
        title={t(`${result}_title`)}
        body={t(`${result}_body`)}
        action={{ title: t('common:done'), onPress: close }}
      />
    );
  } else if (details.isError) {
    const e = details.error;
    const p = isApiError(e) ? qrProblem(e.code, e.status) : 'other';
    body =
      p === 'other' ? (
        <EmptyState
          icon={isApiError(e, 'NETWORK_ERROR') ? 'offline' : 'error'}
          title={t('common:load_failed')}
          body={apiErrorMessage(e)}
          action={{ title: t('common:retry'), icon: 'refresh', onPress: () => void details.refetch() }}
        />
      ) : (
        <Problem problem={p} />
      );
  } else if (!details.data) {
    body = (
      <View className="gap-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-40" />
      </View>
    );
  } else {
    const d = details.data;
    const expired = left === 0;
    const resolved = d.status !== 'pending';
    const place = locationLabel(d.location);
    body = (
      <>
        <Card>
          <View className="flex-row items-center gap-3">
            <View className="size-12 items-center justify-center rounded-xl bg-secondary">
              <Icon name="devices" tone="primary" size={24} />
            </View>
            <View className="flex-1 gap-0.5">
              <Text variant="headline">{t('question')}</Text>
              <Text variant="callout" tone="muted">
                {t('question_hint')}
              </Text>
            </View>
          </View>
        </Card>
        <List>
          <ListRow icon="devices" title={clientLabel(d.client)} subtitle={t(`device.${d.client.device_type}`)} />
          <ListRow icon="link" title={d.ip || '—'} subtitle={t('ip')} />
          <ListRow icon="info" title={place ?? t('location_unknown')} subtitle={t('location')} />
          <ListRow
            icon="clock"
            title={formatShort(d.created_at)}
            subtitle={expired ? t('expired') : t('expires_in', { seconds: left ?? 0 })}
            last
          />
        </List>
        <Text variant="footnote" tone="muted" className="px-1">
          {t('warning')}
        </Text>
        {resolved || expired ? (
          <Problem problem={expired ? 'expired' : 'resolved'} />
        ) : (
          <View className="gap-2">
            <Button
              title={t('approve')}
              icon="check"
              size="lg"
              loading={decide.isPending && decide.variables === 'approve'}
              disabled={decide.isPending}
              onPress={() => run('approve')}
            />
            <Button
              title={t('reject')}
              icon="close"
              variant="outline"
              size="lg"
              loading={decide.isPending && decide.variables === 'reject'}
              disabled={decide.isPending}
              onPress={() => run('reject')}
            />
          </View>
        )}
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: t('title') }} />
      <Screen>{body}</Screen>
    </>
  );
}

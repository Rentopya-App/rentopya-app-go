import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, Platform, Pressable, Share, View } from 'react-native';

import { formErrors } from '@/core/api/form-errors';
import { Permission, useCan } from '@/core/auth/permissions';
import { apiErrorMessage } from '@/core/i18n';
import { useDebounced } from '@/core/use-debounced';
import { Button } from '@/ui/button';
import { Chips } from '@/ui/chips';
import { cn } from '@/ui/cn';
import { TextArea } from '@/ui/fields';
import { Icon } from '@/ui/icon';
import { List } from '@/ui/list';
import { PagedList } from '@/ui/paged-list';
import { QueryState } from '@/ui/query-state';
import { FormScreen } from '@/ui/screen';
import { SearchField } from '@/ui/search-field';
import { Text } from '@/ui/text';
import { toast } from '@/ui/toast';

import { useCancelPaymentLink, useMatchOrphan, usePaymentLinks, usePaymentOrphans, useReservationSearch } from './api';
import {
  LINK_STATUSES,
  linkCancellable,
  linkStatusKey,
  matchPayload,
  ORPHAN_STATUSES,
  orphanStatusKey,
  type PaymentLink,
} from './model';
import { Forbidden, LinkRow, OrphanRow } from './parts';

const ALL = '__all__';

function confirmCancel(t: (k: string) => string, run: () => void) {
  if (Platform.OS === 'web') {
    run();
    return;
  }
  Alert.alert(t('payments:links.cancel_title'), t('payments:links.cancel_description'), [
    { text: t('common:cancel'), style: 'cancel' },
    { text: t('payments:links.cancel'), style: 'destructive', onPress: run },
  ]);
}

function LinkActions({ l }: { l: PaymentLink }) {
  const { t } = useTranslation(['finance_app', 'payments']);
  const can = useCan();
  const cancel = useCancelPaymentLink();
  const active = linkCancellable(l);
  if (!active) return null;
  return (
    <View className="flex-row flex-wrap gap-2 pt-1">
      <Button
        variant="secondary"
        icon="link"
        title={t('share_link')}
        onPress={() => void Share.share({ message: l.url, url: l.url })}
      />
      <Button
        variant="ghost"
        icon="externalLink"
        title={t('payments:links.open')}
        onPress={() => void Linking.openURL(l.url)}
      />
      {can(Permission.TenantPaymentsCreateLink) ? (
        <Button
          variant="ghost"
          icon="cancel"
          title={t('payments:links.cancel')}
          loading={cancel.isPending}
          onPress={() =>
            confirmCancel(t, () =>
              cancel.mutate(l.uuid, {
                onSuccess: () => toast.success(t('payments:toast.link_cancelled')),
                onError: (e) => toast.error(apiErrorMessage(e)),
              }),
            )
          }
        />
      ) : null}
    </View>
  );
}

/**
 * "Ödeme linkleri" (`tenant.payments.read`): every reservation's pay-by-link
 * links. An active link is shared again, opened or cancelled
 * (`tenant.payments.create_link`); a new link is made on the reservation.
 */
export function PaymentLinksScreen() {
  const { t } = useTranslation(['finance_app', 'payments']);
  const can = useCan();
  const readable = can(Permission.TenantPaymentsRead);
  const [status, setStatus] = useState<string>('active');
  const query = usePaymentLinks(status === ALL ? null : status, readable);
  const header = (
    <>
      <Chips
        options={[
          { value: ALL, label: t('common:all') },
          ...LINK_STATUSES.map((s) => ({ value: s, label: t(linkStatusKey(s)) })),
        ]}
        value={status}
        onChange={setStatus}
      />
      <Text variant="footnote" tone="muted" className="px-1">
        {t('links_hint')}
      </Text>
    </>
  );
  return (
    <>
      <Stack.Screen options={{ title: t('payments:links.title') }} />
      {readable ? (
        <PagedList
          query={query}
          header={header}
          keyOf={(l) => l.uuid}
          empty={t('payments:links.empty_title')}
          renderItem={(l, _i, last) => (
            <LinkRow
              l={l}
              last={last}
              onPress={() => router.push(`/reservations/${l.reservation.uuid}`)}
              actions={<LinkActions l={l} />}
            />
          )}
        />
      ) : (
        <Forbidden body={t('payments:orphans.forbidden')} />
      )}
    </>
  );
}

/**
 * "Eşleşmeyen ödemeler" (`tenant.payments.read`): provider notifications for
 * checkouts we have no record of. "Rezervasyonla eşleştir"
 * (`tenant.payment.collect`) records it as a payment of the chosen reservation.
 */
export function PaymentOrphansScreen() {
  const { t } = useTranslation(['finance_app', 'payments']);
  const can = useCan();
  const readable = can(Permission.TenantPaymentsRead);
  const collect = can(Permission.TenantPaymentCollect);
  const [status, setStatus] = useState<string>('unmatched');
  const query = usePaymentOrphans(status === ALL ? null : status, readable);
  const header = (
    <>
      <Text variant="footnote" tone="muted" className="px-1">
        {t('payments:orphans.description')}
      </Text>
      <Chips
        options={[
          { value: ALL, label: t('common:all') },
          ...ORPHAN_STATUSES.map((s) => ({ value: s, label: t(orphanStatusKey(s)) })),
        ]}
        value={status}
        onChange={setStatus}
      />
    </>
  );
  return (
    <>
      <Stack.Screen options={{ title: t('payments:orphans.title') }} />
      {readable ? (
        <PagedList
          query={query}
          header={header}
          keyOf={(o) => o.uuid}
          empty={t('payments:orphans.empty_title')}
          renderItem={(o, _i, last) => (
            <OrphanRow
              o={o}
              last={last}
              actions={
                o.status === 'unmatched' && collect ? (
                  <View className="flex-row pt-1">
                    <Button
                      variant="secondary"
                      icon="link"
                      title={t('payments:orphans.actions.match')}
                      onPress={() =>
                        router.push({
                          pathname: '/finance/payment-orphans/[uuid]/match',
                          params: { uuid: o.uuid, payment: o.provider_payment_id || o.conversation_id },
                        })
                      }
                    />
                  </View>
                ) : o.reservation ? (
                  <View className="flex-row pt-1">
                    <Button
                      variant="ghost"
                      icon="calendar"
                      title={t('open_reservation')}
                      onPress={() => router.push(`/reservations/${o.reservation!.uuid}`)}
                    />
                  </View>
                ) : null
              }
            />
          )}
        />
      ) : (
        <Forbidden body={t('payments:orphans.forbidden')} />
      )}
    </>
  );
}

/** "Rezervasyonla eşleştir": pick the reservation the money belongs to and say why. */
export function MatchOrphanScreen({ uuid }: { uuid: string }) {
  const { t } = useTranslation(['finance_app', 'payments']);
  const params = useLocalSearchParams<{ payment?: string }>();
  const can = useCan();
  const allowed = can(Permission.TenantPaymentsRead) && can(Permission.TenantPaymentCollect);
  const [q, setQ] = useState('');
  const search = useDebounced(q);
  const [picked, setPicked] = useState<{ uuid: string; reference: string } | null>(null);
  const [note, setNote] = useState('');
  const reservations = useReservationSearch(search, allowed);
  const match = useMatchOrphan(uuid);
  const built = matchPayload(picked?.uuid ?? null, note);
  const err = formErrors(match.error);

  return (
    <>
      <Stack.Screen options={{ title: t('payments:orphans.match.title'), presentation: 'modal' }} />
      {allowed ? (
        <FormScreen
          footer={
            <>
              {err.message ? (
                <Text variant="footnote" tone="danger">
                  {err.message}
                </Text>
              ) : null}
              <Button
                size="lg"
                icon="link"
                title={t('payments:orphans.match.confirm')}
                disabled={!built.ok}
                loading={match.isPending}
                onPress={() =>
                  built.ok &&
                  match.mutate(built.body, {
                    onSuccess: () => {
                      toast.success(t('payments:orphans.toast.matched'));
                      router.back();
                    },
                  })
                }
              />
            </>
          }>
          <Text tone="muted">{t('payments:orphans.match.description', { payment: params.payment ?? '' })}</Text>
          <Text variant="footnote" tone="muted" className="font-sans-medium">
            {t('payments:orphans.match.reservation')}
          </Text>
          <SearchField value={q} onChangeText={setQ} placeholder={t('payments:orphans.match.reservation_search')} />
          <QueryState query={reservations} rows={3}>
            {(page) =>
              page.items.length === 0 ? (
                <Text variant="footnote" tone="muted" className="px-1">
                  {t('payments:orphans.match.reservation_empty')}
                </Text>
              ) : (
                <List>
                  {page.items.map((r, i) => {
                    const on = picked?.uuid === r.uuid;
                    return (
                      <Pressable
                        key={r.uuid}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on }}
                        onPress={() => setPicked({ uuid: r.uuid, reference: r.reference })}
                        className={cn(
                          'flex-row items-center gap-3 px-4 py-3 active:bg-muted',
                          i < page.items.length - 1 && 'border-b border-border',
                          on && 'bg-secondary',
                        )}>
                        <View className="flex-1 gap-0.5">
                          <Text variant="headline" numberOfLines={1}>
                            {r.reference}
                          </Text>
                          <Text variant="footnote" tone="muted" numberOfLines={1}>
                            {r.customer.display_name}
                          </Text>
                        </View>
                        {on ? <Icon name="check" tone="primary" size={20} /> : null}
                      </Pressable>
                    );
                  })}
                </List>
              )
            }
          </QueryState>
          <TextArea
            label={t('payments:orphans.match.note')}
            value={note}
            onChangeText={setNote}
            maxLength={500}
            error={
              note !== '' && !built.ok && built.error === 'note'
                ? t('payments:orphans.match.note_invalid')
                : err.fields.note
            }
          />
        </FormScreen>
      ) : (
        <Forbidden body={t('payments:orphans.forbidden')} />
      )}
    </>
  );
}

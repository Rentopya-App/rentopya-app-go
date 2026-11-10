import * as Linking from 'expo-linking';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, RefreshControl, Share, View } from 'react-native';

import { apiErrorMessage } from '@/core/i18n';
import { Permission, usePermissions, useCan } from '@/core/auth/permissions';
import { formatMoney, formatShort } from '@/core/format';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Icon } from '@/ui/icon';
import type { IconName } from '@/ui/icons';
import { QueryState } from '@/ui/query-state';
import { Screen } from '@/ui/screen';
import { StatusPill } from '@/ui/status-pill';
import { Text } from '@/ui/text';
import { toast } from '@/ui/toast';

import {
  useCancelLink,
  useCustomerRequests,
  usePaymentLinks,
  usePayments,
  useReservation,
  useReservationEvents,
  useTasks,
  useTransition,
} from './api';
import {
  availableActions,
  eventKey,
  isDestructive,
  LINK_TONES,
  linkActions,
  PAYMENT_ROW_TONES,
  paymentActions,
  personName,
  placeText,
  primaryAction,
  REQUEST_TONES,
  smsUrl,
  TASK_TONES,
  vehicleText,
  type PaymentLink,
  type Reservation,
  type ReservationAction,
} from './lib';
import { confirmStep, Gate, Lines, PaymentChip, rangeText, StatusChip } from './parts';

/**
 * One reservation (the panel's `/reservations/{uuid}`): status and the
 * actions the API and the member's permissions allow, the rental, the
 * customer and drivers, the vehicle plan, the price, payments (links and
 * collections), resolution tasks, customer requests and the timeline.
 */
export function ReservationDetailScreen() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const { t } = useTranslation('reservations');
  return (
    <>
      <Stack.Screen options={{ title: t('detail_title') }} />
      <Gate perm={Permission.TenantReservationsRead} body={t('forbidden')}>
        <Detail uuid={uuid} />
      </Gate>
    </>
  );
}

function Detail({ uuid }: { uuid: string }) {
  const query = useReservation(uuid);
  const events = useReservationEvents(uuid);
  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching}
          onRefresh={() => {
            void query.refetch();
            void events.refetch();
          }}
        />
      }>
      <QueryState query={query} rows={6}>
        {(r) => (
          <>
            <Stack.Screen options={{ title: r.reference }} />
            <Header r={r} />
            <Actions r={r} />
            <Overview r={r} />
            <Customer r={r} />
            <Plan r={r} />
            <Price r={r} />
            <Payments r={r} />
            <Tasks r={r} />
            <Requests r={r} />
            <Timeline uuid={r.uuid} />
          </>
        )}
      </QueryState>
    </Screen>
  );
}

function Header({ r }: { r: Reservation }) {
  const { t } = useTranslation('reservations');
  return (
    <View className="gap-2 px-1">
      <Text variant="title" numberOfLines={2}>
        {r.customer.display_name}
      </Text>
      <Text variant="callout" tone="muted">
        {`${r.plan.product.code} · ${rangeText(r.starts_at, r.ends_at)}`}
      </Text>
      <View className="flex-row flex-wrap gap-1.5">
        <StatusChip status={r.status} />
        <PaymentChip status={r.payment_status} />
        <StatusPill label={t(`commitment.${r.capacity_commitment}`)} />
        {r.open_tasks > 0 ? <StatusPill label={t('open_tasks_badge', { count: r.open_tasks })} tone="problem" /> : null}
        {r.plan.hold_expires_at ? (
          <StatusPill label={t('detail.hold_until', { time: formatShort(r.plan.hold_expires_at) })} tone="progress" />
        ) : null}
      </View>
    </View>
  );
}

const ICONS: Record<ReservationAction, IconName> = {
  submit: 'forward',
  approve: 'check',
  reject: 'close',
  confirm: 'check',
  change: 'edit',
  extend: 'calendar',
  plate: 'car',
  drivers: 'customers',
  assign: 'customer',
  no_show: 'cancel',
  cancel: 'cancel',
};

function Actions({ r }: { r: Reservation }) {
  const { t } = useTranslation('reservations');
  const granted = usePermissions();
  const transition = useTransition(r.uuid);
  const actions = availableActions(r.actions, (slug) => granted.includes(slug));
  if (!actions.length) return null;
  const main = primaryAction(actions);

  const label = (a: ReservationAction) => (a === 'reject' ? t('payments:approvals.reject') : t(`actions.${a}`));

  const run = (a: ReservationAction) => {
    const base = `/reservations/${r.uuid}`;
    switch (a) {
      case 'submit':
      case 'confirm':
        confirmStep({
          title: t(`${a}.title`),
          body: t(`${a}.description`),
          ok: t('actions.continue'),
          cancel: t('common:cancel'),
          onOk: () =>
            transition.mutate(
              { action: a },
              {
                onSuccess: () => toast.success(t(a === 'submit' ? 'toast.submitted' : 'toast.confirmed')),
                onError: (e) => toast.error(apiErrorMessage(e)),
              },
            ),
        });
        return;
      case 'approve':
        router.push(`${base}/accept`);
        return;
      case 'no_show':
        router.push(`${base}/no-show`);
        return;
      default:
        router.push(`${base}/${a}`);
    }
  };

  return (
    <Card>
      {actions.map((a) => (
        <Button
          key={a}
          size={a === main ? 'lg' : 'md'}
          variant={a === main ? 'primary' : isDestructive(a) ? 'ghost' : 'outline'}
          icon={ICONS[a]}
          title={label(a)}
          loading={transition.isPending && (a === 'submit' || a === 'confirm')}
          onPress={() => run(a)}
        />
      ))}
    </Card>
  );
}

function Overview({ r }: { r: Reservation }) {
  const { t } = useTranslation('reservations');
  const deadline = r.review_deadline ?? r.payment_deadline;
  return (
    <Card title={t('detail.rental')}>
      <Lines
        lines={[
          {
            label: t('fields.pickup'),
            value: `${placeText(r.pickup_branch, r.pickup_point)} — ${formatShort(r.starts_at)}`,
          },
          {
            label: t('fields.return'),
            value: `${placeText(r.return_branch, r.return_point)} — ${formatShort(r.ends_at)}`,
          },
          { label: t('fields.billing_days'), value: String(r.billing_days) },
          { label: t('fields.product'), value: `${r.plan.product.code} · ${r.plan.product.title}` },
          { label: t('fields.channel'), value: r.channel },
          { label: t('fields.external_reference'), value: r.external_reference },
          { label: t('fields.deadline'), value: deadline ? formatShort(deadline) : null },
          { label: t('fields.assigned_user'), value: personName(r.assigned_user) || '—' },
          {
            label: t('fields.created'),
            value: [formatShort(r.created_at), personName(r.created_by)].filter(Boolean).join(' · '),
          },
          { label: t('fields.cancel_reason'), value: r.cancel_reason || null },
          { label: t('fields.note'), value: r.note || null },
        ]}
      />
    </Card>
  );
}

function Customer({ r }: { r: Reservation }) {
  const { t } = useTranslation('reservations');
  const c = r.customer;
  return (
    <Card title={t('detail.customer')}>
      <Lines
        lines={[
          { label: t('fields.customer'), value: c.display_name },
          { label: t('fields.identity'), value: c.identity_masked || null },
          { label: t('fields.phone'), value: c.phone_masked || null },
          { label: t('fields.email'), value: c.email_masked || null },
          { label: t('fields.invoice_customer'), value: r.invoice_customer?.display_name ?? null },
          {
            label: t('fields.agreement'),
            value: r.agreement
              ? `${r.agreement.code} · ${r.agreement.name}${r.open_account ? ` (${t('fields.open_account')})` : ''}`
              : null,
          },
        ]}
      />
      <Text variant="caption" tone="muted">
        {t('drivers.title')}
      </Text>
      {r.drivers.length === 0 ? (
        <Text variant="callout" tone="muted">
          {t('drivers.none')}
        </Text>
      ) : (
        r.drivers.map((d, i) => (
          <View key={d.driver_uuid ?? i} className="gap-1 border-b border-border pb-2">
            <View className="flex-row flex-wrap items-center gap-1.5">
              <Text variant="callout" className="font-sans-semibold">
                {d.name}
              </Text>
              {d.role === 'primary' ? <StatusPill label={t('drivers.primary_short')} /> : null}
              <StatusPill
                label={
                  d.eligible
                    ? t('drivers.eligible')
                    : d.override_reason
                      ? t('drivers.overridden')
                      : t('drivers.not_eligible')
                }
                tone={d.eligible ? 'done' : d.override_reason ? 'progress' : 'problem'}
              />
            </View>
            <Text variant="footnote" tone="muted">
              {[d.licence_class, d.licence_masked].filter(Boolean).join(' · ') || '—'}
            </Text>
            {!d.eligible && d.reasons.length ? (
              <Text variant="footnote" tone="danger">
                {d.reasons.map((x) => t(`driver_reasons.${x}`, { defaultValue: x })).join(', ')}
              </Text>
            ) : null}
          </View>
        ))
      )}
    </Card>
  );
}

function Plan({ r }: { r: Reservation }) {
  const { t } = useTranslation('reservations');
  const p = r.plan;
  const upgraded = p.sold_product.uuid !== p.product.uuid;
  return (
    <Card title={t('plan.title')}>
      <Lines
        lines={[
          {
            label: t('plan.sold_product'),
            value: `${p.sold_product.code} · ${p.sold_product.title} (v${p.sold_product.version})`,
          },
          {
            label: t('plan.current_product'),
            value: upgraded ? `${p.product.code} · ${p.product.title} (v${p.product.version})` : null,
          },
          { label: t('conditions.guarantee'), value: p.conditions.guarantee_label || p.guarantee_type },
          { label: t('plan.planned_vehicle'), value: vehicleText(p.planned_vehicle) || '—' },
          { label: t('plan.assigned_vehicle'), value: vehicleText(p.assigned_vehicle) || t('plan.not_fixed') },
          {
            label: t('plan.allocation'),
            value: p.allocation_uuid ? `${p.allocation_kind} · ${p.allocation_status}` : t('plan.no_capacity'),
          },
          { label: t('plan.hold_expires_at'), value: p.hold_expires_at ? formatShort(p.hold_expires_at) : null },
        ]}
      />
      <Text variant="footnote" tone="muted">
        {t('plan.help')}
      </Text>
    </Card>
  );
}

function Price({ r }: { r: Reservation }) {
  const { t } = useTranslation('reservations');
  const p = r.price;
  const m = (v: string) => formatMoney(v, p.currency);
  const commission = Number(p.commission) > 0;
  return (
    <Card title={t('price.title')}>
      {p.snapshot.kept_price ? <StatusPill label={t('price.kept')} tone="progress" /> : null}
      <Lines
        lines={[
          { label: t('price.base_total'), value: m(p.snapshot.base_total) },
          { label: t('price.vat_total'), value: m(p.snapshot.vat_total) },
          { label: t('price.total'), value: m(p.total) },
          { label: t('price.prepayment'), value: m(p.prepayment) },
          { label: t('price.paid'), value: m(p.paid) },
          { label: t('price.balance'), value: m(p.balance) },
          { label: t('price.commission'), value: commission ? m(p.commission) : null },
          { label: t('price.net_receivable'), value: commission ? m(p.net_receivable) : null },
          {
            label: t('price.extensions'),
            value: p.snapshot.extensions.length ? String(p.snapshot.extensions.length) : null,
          },
          { label: t('discount.coupon_title'), value: p.snapshot.coupon_code ?? null },
          {
            label: t('discount.manual_title'),
            value: p.snapshot.manual_discount ? p.snapshot.manual_discount.reason : null,
          },
        ]}
      />
    </Card>
  );
}

/** Text sent with a payment link (share sheet or the messages app). */
function linkMessage(t: (k: string, o?: Record<string, string>) => string, r: Reservation, link: PaymentLink) {
  return t('reservations_app:links.message', {
    reference: r.reference,
    amount: formatMoney(link.amount, link.currency),
    url: link.url,
  });
}

export function shareLink(text: string) {
  return Share.share({ message: text }).catch(() => undefined);
}

export function smsLink(text: string, failed: string) {
  return Linking.openURL(smsUrl(text, Platform.OS)).catch(() => toast.error(failed));
}

function Payments({ r }: { r: Reservation }) {
  const { t } = useTranslation('payments');
  const granted = usePermissions();
  const has = (slug: string) => granted.includes(slug);
  const pa = paymentActions(r, has);
  const links = usePaymentLinks(r.uuid, pa.read);
  const payments = usePayments(r.uuid, pa.read);
  const cancel = useCancelLink(r.uuid);
  const m = (v: string) => formatMoney(v, r.price.currency);
  return (
    <Card title={t('summary.title')}>
      <Lines
        lines={[
          { label: t('summary.total'), value: m(r.price.total) },
          { label: t('summary.prepayment'), value: m(r.price.prepayment) },
          { label: t('summary.paid'), value: m(r.price.paid) },
          { label: t('summary.prepayment_due'), value: m(r.price.prepayment_due) },
          { label: t('summary.balance'), value: m(r.price.balance) },
        ]}
      />
      {r.status === 'awaiting_payment' && r.payment_deadline ? (
        <Text variant="footnote" tone="muted">
          {t('summary.payment_deadline', { deadline: formatShort(r.payment_deadline) })}
        </Text>
      ) : null}
      {pa.createLink || pa.collect ? (
        <View className="gap-2">
          {pa.createLink ? (
            <Button
              icon="link"
              title={t('actions.create_link')}
              onPress={() => router.push(`/reservations/${r.uuid}/payment-link`)}
            />
          ) : null}
          {pa.collect ? (
            <Button
              variant="outline"
              icon="wallet"
              title={t('actions.collect')}
              onPress={() => router.push(`/reservations/${r.uuid}/collect`)}
            />
          ) : null}
        </View>
      ) : null}
      {pa.read ? (
        <>
          <Text variant="caption" tone="muted">
            {t('links.title')}
          </Text>
          <QueryState query={links} rows={1}>
            {(page) =>
              page.items.length === 0 ? (
                <Text variant="callout" tone="muted">
                  {t('links.empty_title')}
                </Text>
              ) : (
                page.items.map((link) => {
                  const la = linkActions(link, has);
                  const text = linkMessage(t, r, link);
                  return (
                    <View key={link.uuid} className="gap-2 border-b border-border pb-3">
                      <View className="flex-row flex-wrap items-center gap-1.5">
                        <Text variant="callout" className="font-sans-semibold">
                          {formatMoney(link.amount, link.currency)}
                        </Text>
                        <StatusPill label={t(`links.statuses.${link.status}`)} tone={LINK_TONES[link.status]} />
                      </View>
                      <Text variant="footnote" tone="muted">
                        {`${t('links.columns.expires_at')}: ${formatShort(link.expires_at)}`}
                      </Text>
                      {la.send || la.cancel ? (
                        <View className="flex-row flex-wrap gap-2">
                          {la.send ? (
                            <Button
                              variant="outline"
                              icon="mail"
                              title={t('reservations_app:links.sms')}
                              onPress={() => void smsLink(text, t('reservations_app:links.sms_failed'))}
                            />
                          ) : null}
                          {la.send ? (
                            <Button
                              variant="outline"
                              icon="externalLink"
                              title={t('reservations_app:links.share')}
                              onPress={() => void shareLink(text)}
                            />
                          ) : null}
                          {la.cancel ? (
                            <Button
                              variant="ghost"
                              icon="cancel"
                              title={t('links.cancel')}
                              disabled={cancel.isPending}
                              onPress={() =>
                                confirmStep({
                                  title: t('links.cancel_title'),
                                  body: t('links.cancel_description'),
                                  ok: t('links.cancel'),
                                  cancel: t('common:cancel'),
                                  destructive: true,
                                  onOk: () =>
                                    cancel.mutate(link.uuid, {
                                      onSuccess: () => toast.success(t('toast.link_cancelled')),
                                      onError: (e) => toast.error(apiErrorMessage(e)),
                                    }),
                                })
                              }
                            />
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  );
                })
              )
            }
          </QueryState>
          <Text variant="caption" tone="muted">
            {t('list_title')}
          </Text>
          <QueryState query={payments} rows={1}>
            {(page) =>
              page.items.length === 0 ? (
                <Text variant="callout" tone="muted">
                  {t('empty_title')}
                </Text>
              ) : (
                page.items.map((p) => (
                  <View key={p.uuid} className="gap-1 border-b border-border pb-2">
                    <View className="flex-row flex-wrap items-center gap-1.5">
                      <Text variant="callout" className="font-sans-semibold">
                        {formatMoney(p.amount, p.currency)}
                      </Text>
                      <StatusPill label={t(`statuses.${p.status}`)} tone={PAYMENT_ROW_TONES[p.status]} />
                    </View>
                    <Text variant="footnote" tone="muted">
                      {[formatShort(p.created_at), t(`methods.${p.method}`), p.note].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                ))
              )
            }
          </QueryState>
        </>
      ) : null}
    </Card>
  );
}

function Tasks({ r }: { r: Reservation }) {
  const { t } = useTranslation('reservations');
  const can = useCan();
  const allowed = can(Permission.TenantResolutionTasksRead);
  const query = useTasks({ q: '', status: 'all', reservation: r.uuid }, allowed);
  if (!allowed) return null;
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <Card title={t('tabs.tasks')}>
      {query.isLoading ? (
        <Text tone="muted">{t('common:loading')}</Text>
      ) : items.length === 0 ? (
        <Text variant="callout" tone="muted">
          {t('tasks.empty_title')}
        </Text>
      ) : (
        items.map((task) => (
          <Pressable
            key={task.uuid}
            accessibilityRole="button"
            onPress={() => router.push(`/reservations/tasks/${task.uuid}`)}
            className="flex-row items-center gap-2 border-b border-border pb-2 active:opacity-70">
            <View className="flex-1 gap-1">
              <View className="flex-row flex-wrap items-center gap-1.5">
                <Text variant="callout" className="font-sans-semibold">
                  {t(`tasks.types.${task.task_type}`)}
                </Text>
                <StatusPill label={t(`tasks.statuses.${task.status}`)} tone={TASK_TONES[task.status]} />
              </View>
              {task.reason ? (
                <Text variant="footnote" tone="muted" numberOfLines={2}>
                  {task.reason}
                </Text>
              ) : null}
            </View>
            <Icon name="forward" tone="muted-foreground" size={16} />
          </Pressable>
        ))
      )}
    </Card>
  );
}

function Requests({ r }: { r: Reservation }) {
  const { t } = useTranslation('customer_portal');
  const query = useCustomerRequests({ q: '', status: 'all', reservation: r.uuid });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  if (!query.isLoading && items.length === 0) return null;
  return (
    <Card title={t('staff.title')}>
      {items.map((req) => (
        <Pressable
          key={req.uuid}
          accessibilityRole="button"
          onPress={() => router.push(`/reservations/requests/${req.uuid}`)}
          className="flex-row items-center gap-2 border-b border-border pb-2 active:opacity-70">
          <View className="flex-1 gap-1">
            <View className="flex-row flex-wrap items-center gap-1.5">
              <Text variant="callout" className="font-sans-semibold">
                {t(`request_types.${req.type}`)}
              </Text>
              <StatusPill label={t(`request_statuses.${req.status}`)} tone={REQUEST_TONES[req.status]} />
            </View>
            <Text variant="footnote" tone="muted" numberOfLines={2}>
              {[formatShort(req.created_at), req.message].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <Icon name="forward" tone="muted-foreground" size={16} />
        </Pressable>
      ))}
    </Card>
  );
}

/** Newest first, 20 at a time (the panel's paged timeline). */
function Timeline({ uuid }: { uuid: string }) {
  const { t } = useTranslation('reservations');
  const query = useReservationEvents(uuid);
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const status = (s: string | null) => (s ? t(`statuses.${s}`, { defaultValue: s }) : '—');
  return (
    <Card title={t('events.title')}>
      {query.isLoading ? (
        <Text tone="muted">{t('common:loading')}</Text>
      ) : items.length === 0 ? (
        <Text variant="callout" tone="muted">
          {t('events.empty')}
        </Text>
      ) : (
        <View>
          {items.map((e, i) => {
            const key = eventKey(e.action);
            return (
              <View key={e.uuid} className="flex-row gap-3">
                <View className="items-center">
                  <View className="mt-1.5 size-2 rounded-full bg-primary" />
                  {i < items.length - 1 ? <View className="w-px flex-1 bg-border" /> : null}
                </View>
                <View className="flex-1 gap-0.5 pb-3">
                  <Text variant="callout" className="font-sans-medium">
                    {key ? t(key) : e.action}
                  </Text>
                  {e.to_status ? (
                    <Text variant="footnote">{`${status(e.from_status)} → ${status(e.to_status)}`}</Text>
                  ) : null}
                  {e.reason ? <Text variant="footnote">{e.reason}</Text> : null}
                  <Text variant="footnote" tone="muted">
                    {[formatShort(e.created_at), e.actor ? personName(e.actor) : t('plan.system')].join(' · ')}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
      {query.hasNextPage ? (
        <Button
          variant="ghost"
          title={t('common:more')}
          loading={query.isFetchingNextPage}
          onPress={() => void query.fetchNextPage()}
        />
      ) : null}
    </Card>
  );
}

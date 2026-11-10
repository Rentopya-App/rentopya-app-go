import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { formatCalendarDate, formatMoney, formatShort } from '@/core/format';
import { cn } from '@/ui/cn';
import { EmptyState } from '@/ui/empty-state';
import { Icon } from '@/ui/icon';
import type { IconName } from '@/ui/icons';
import { StatusPill } from '@/ui/status-pill';
import { Text } from '@/ui/text';

import {
  COLLECTION_TONE,
  collectionStatusKey,
  DEPOSIT_TONE,
  depositMethodKey,
  depositStatusKey,
  LINK_TONE,
  linkStatusKey,
  methodKey,
  ORPHAN_TONE,
  orphanStatusKey,
  type FinanceCollection,
  type PaymentLink,
  type PaymentWebhookOrphan,
  type SecurityDeposit,
} from './model';

/** List row frame: tappable, separator unless last. */
function Row({
  onPress,
  last,
  label,
  children,
}: {
  onPress?: () => void;
  last?: boolean;
  label: string;
  children: ReactNode;
}) {
  const body = <View className={cn('gap-1.5 px-4 py-3', !last && 'border-b border-border')}>{children}</View>;
  if (!onPress) return body;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} className="active:bg-muted">
      {body}
    </Pressable>
  );
}

function Line({ left, right }: { left: ReactNode; right?: ReactNode }) {
  return (
    <View className="flex-row items-center gap-3">
      <View className="min-w-0 flex-1">{left}</View>
      {right}
    </View>
  );
}

function Meta({ icon, text }: { icon?: IconName; text: string }) {
  return (
    <View className="min-w-0 flex-1 flex-row items-center gap-1">
      {icon ? <Icon name={icon} tone="muted-foreground" size={14} /> : null}
      <Text variant="footnote" tone="muted" numberOfLines={1} className="flex-1">
        {text}
      </Text>
    </View>
  );
}

/** One collection: number, amount, who paid, method, branch and state. */
export function CollectionRow({ c, onPress, last }: { c: FinanceCollection; onPress: () => void; last?: boolean }) {
  const { t } = useTranslation();
  const credit = Number(c.unallocated_amount) > 0 && c.status !== 'void';
  return (
    <Row onPress={onPress} last={last} label={`${c.code}, ${formatMoney(c.amount, c.currency)}`}>
      <Line
        left={
          <Text variant="headline" numberOfLines={1}>
            {c.code}
          </Text>
        }
        right={
          <Text variant="headline" className="tabular-nums">
            {formatMoney(c.amount, c.currency)}
          </Text>
        }
      />
      <Text variant="callout" numberOfLines={1}>
        {c.account.name || c.account.code || '—'}
        {c.rental?.code ? ` · ${c.rental.code}` : ''}
      </Text>
      <Line
        left={
          <Meta
            icon="card"
            text={[
              t(methodKey(c.method)),
              c.branch?.name ?? t('finance:head_office'),
              formatCalendarDate(c.collection_date),
            ]
              .filter(Boolean)
              .join(' · ')}
          />
        }
        right={<StatusPill label={t(collectionStatusKey(c.status))} tone={COLLECTION_TONE[c.status]} />}
      />
      {credit ? (
        <Text variant="footnote" tone="muted">
          {t('finance_app:credit_left', { amount: formatMoney(c.unallocated_amount, c.currency) })}
        </Text>
      ) : null}
    </Row>
  );
}

/** One deposit: rental and customer, amount, method, state and how long it is held. */
export function DepositRow({ d, onPress, last }: { d: SecurityDeposit; onPress: () => void; last?: boolean }) {
  const { t } = useTranslation();
  return (
    <Row onPress={onPress} last={last} label={`${d.rental.code ?? ''}, ${formatMoney(d.amount, d.currency)}`}>
      <Line
        left={
          <Text variant="headline" numberOfLines={1}>
            {d.rental.code || '—'}
          </Text>
        }
        right={
          <Text variant="headline" className="tabular-nums">
            {formatMoney(d.amount, d.currency)}
          </Text>
        }
      />
      <Text variant="callout" numberOfLines={1}>
        {d.customer.name || '—'}
      </Text>
      <Line
        left={
          <Meta icon="security" text={[t(depositMethodKey(d.method)), d.branch.name].filter(Boolean).join(' · ')} />
        }
        right={<StatusPill label={t(depositStatusKey(d.status))} tone={DEPOSIT_TONE[d.status]} />}
      />
      {d.status === 'held' && d.held_days > 0 ? (
        <Text variant="footnote" tone="muted">
          {t('deposits:detail.held_days', { days: d.held_days })}
        </Text>
      ) : null}
    </Row>
  );
}

/** One pay-by-link link: reservation, amount, state and expiry. */
export function LinkRow({
  l,
  onPress,
  last,
  actions,
}: {
  l: PaymentLink;
  onPress: () => void;
  last?: boolean;
  actions?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Row onPress={onPress} last={last} label={`${l.reservation.reference}, ${formatMoney(l.amount, l.currency)}`}>
      <Line
        left={
          <Text variant="headline" numberOfLines={1}>
            {l.reservation.reference}
          </Text>
        }
        right={
          <Text variant="headline" className="tabular-nums">
            {formatMoney(l.amount, l.currency)}
          </Text>
        }
      />
      <Line
        left={
          <Meta
            icon="clock"
            text={
              l.status === 'paid' && l.paid_at
                ? t('finance_app:link_paid_at', { at: formatShort(l.paid_at) })
                : t('finance_app:link_expires', { at: formatShort(l.expires_at) })
            }
          />
        }
        right={<StatusPill label={t(linkStatusKey(l.status))} tone={LINK_TONE[l.status]} />}
      />
      {actions}
    </Row>
  );
}

/** One unmatched provider notification. */
export function OrphanRow({ o, last, actions }: { o: PaymentWebhookOrphan; last?: boolean; actions?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <Row last={last} label={o.provider_payment_id || o.conversation_id}>
      <Line
        left={
          <Text variant="headline" numberOfLines={1} className="tabular-nums">
            {o.provider_payment_id || '—'}
          </Text>
        }
        right={<StatusPill label={t(orphanStatusKey(o.status))} tone={ORPHAN_TONE[o.status]} />}
      />
      <Text variant="callout" numberOfLines={1}>
        {[o.account_name || o.provider, o.provider_status].filter(Boolean).join(' · ')}
      </Text>
      <Meta icon="clock" text={`${t('payments:orphans.columns.created_at')}: ${formatShort(o.created_at)}`} />
      {o.conversation_id ? (
        <Text variant="footnote" tone="muted" numberOfLines={1}>
          {t('payments:orphans.columns.conversation')}: {o.conversation_id}
        </Text>
      ) : null}
      {o.reservation ? (
        <Text variant="footnote" numberOfLines={2}>
          {t('payments:orphans.columns.reservation')}: {o.reservation.reference}
          {o.match_note ? ` · ${o.match_note}` : ''}
        </Text>
      ) : null}
      {actions}
    </Row>
  );
}

/** Screen-level "no permission" state, with the panel's sentence. */
export function Forbidden({ body }: { body: string }) {
  const { t } = useTranslation();
  return <EmptyState icon="security" title={t('finance_app:forbidden_title')} body={body} />;
}

/** A row of two or three money figures (the panel's header `dl`). */
export function Figures({ items }: { items: { label: string; value: string; tone?: 'danger' | 'muted' }[] }) {
  return (
    <View className="flex-row flex-wrap gap-y-3">
      {items.map((f) => (
        <View key={f.label} className="w-1/2 gap-0.5 pr-2">
          <Text variant="footnote" tone="muted" numberOfLines={1}>
            {f.label}
          </Text>
          <Text
            variant="headline"
            tone={f.tone === 'danger' ? 'danger' : f.tone === 'muted' ? 'muted' : 'default'}
            numberOfLines={1}
            adjustsFontSizeToFit
            className="tabular-nums">
            {f.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

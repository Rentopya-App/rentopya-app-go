import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, View } from 'react-native';

import { useSession } from '@/core/auth/session';
import { DEFAULT_TIME_ZONE, formatDay, formatMoney, formatShort, formatTime, localDate } from '@/core/format';
import { useSelectedBranch } from '@/core/tenant';
import { TodayHeaderActions } from '@/features/search/header-actions';
import { EmptyState } from '@/ui/empty-state';
import { QueryState } from '@/ui/query-state';
import { Screen } from '@/ui/screen';
import { StatusPill } from '@/ui/status-pill';
import { Text } from '@/ui/text';

import { BoardRow, BoardSection, BranchChip, Countdown, joinMeta, KpiChips } from './today-parts';
import {
  documentTarget,
  hasAnything,
  kpiChips,
  operationTone,
  splitOperations,
  type OverviewOperationItem,
  type TenantOverview,
} from './today-model';
import { useNow, useOverview, useOverviewBadges, useRefetchOnFocus } from './use-today';

/** "Today" is the organization's Istanbul calendar day on the API; times are shown in the same zone. */
const ZONE = DEFAULT_TIME_ZONE;

const openRental = (uuid: string) => router.push({ pathname: '/rentals/[uuid]', params: { uuid } });
const openReservation = (uuid: string) => router.push({ pathname: '/reservations/[uuid]', params: { uuid } });

function OperationRows({ items }: { items: OverviewOperationItem[] }) {
  const { t } = useTranslation('today');
  return (
    <>
      {items.map((it, i) => (
        <BoardRow
          key={it.uuid}
          time={formatTime(it.due_at, ZONE)}
          title={it.customer_name || it.rental.reference}
          subtitle={joinMeta([it.plate, it.branch.code, it.rental.reference])}
          trailing={<StatusPill label={t(`op_status.${it.status}`)} tone={operationTone(it.status)} />}
          onPress={() => openRental(it.rental.uuid)}
          last={i === items.length - 1}
        />
      ))}
    </>
  );
}

function Board({ data, now }: { data: TenantOverview; now: number }) {
  const { t } = useTranslation('today');
  const ops = data.today_operations;
  const { handovers, returns } = splitOperations(ops?.items);
  const overdue = data.overdue_returns;
  const approvals = data.approvals;
  const awaiting = data.awaiting_payment;
  const documents = data.documents;
  const progress = (c: { done: number; total: number }) => (
    <Text variant="footnote" tone="muted" className="pb-1.5 pt-5 tabular-nums">
      {t('progress', c)}
    </Text>
  );
  return (
    <>
      {ops ? (
        <BoardSection
          title={t('section.handovers')}
          count={handovers.length}
          note={progress(ops.handovers)}
          empty={t('empty.handovers')}>
          <OperationRows items={handovers} />
        </BoardSection>
      ) : null}
      {ops ? (
        <BoardSection
          title={t('section.returns')}
          count={returns.length}
          note={progress(ops.returns)}
          empty={t('empty.returns')}>
          <OperationRows items={returns} />
        </BoardSection>
      ) : null}
      {overdue ? (
        <BoardSection
          title={t('section.overdue')}
          count={overdue.total}
          empty={t('empty.overdue')}
          more={overdue.total - overdue.items.length}>
          {overdue.items.map((it, i) => (
            <BoardRow
              key={it.uuid}
              title={it.customer_name || it.reference}
              subtitle={joinMeta([
                it.plate,
                it.return_branch.code,
                t('overdue.planned', { at: formatShort(it.planned_return_at, ZONE) }),
              ])}
              trailing={<Countdown deadline={it.planned_return_at} now={now} />}
              onPress={() => openRental(it.uuid)}
              last={i === overdue.items.length - 1}
            />
          ))}
        </BoardSection>
      ) : null}
      {approvals ? (
        <BoardSection
          title={t('section.approvals')}
          count={approvals.total}
          empty={t('empty.approvals')}
          more={approvals.total - approvals.items.length}>
          {approvals.items.map((it, i) => (
            <BoardRow
              key={it.uuid}
              time={formatTime(it.starts_at, ZONE)}
              title={it.customer_name || it.reference}
              subtitle={joinMeta([
                it.reference,
                it.pickup_branch.code,
                formatShort(it.starts_at, ZONE),
                formatMoney(it.total_amount, it.currency),
              ])}
              trailing={<Countdown deadline={it.deadline} now={now} />}
              onPress={() => openReservation(it.uuid)}
              last={i === approvals.items.length - 1}
            />
          ))}
        </BoardSection>
      ) : null}
      {awaiting ? (
        <BoardSection
          title={t('section.awaiting_payment')}
          count={awaiting.total}
          empty={t('empty.awaiting_payment')}
          more={awaiting.total - awaiting.items.length}>
          {awaiting.items.map((it, i) => (
            <BoardRow
              key={it.uuid}
              title={it.customer_name || it.reference}
              subtitle={joinMeta([
                it.reference,
                it.pickup_branch.code,
                formatShort(it.starts_at, ZONE),
                t('awaiting_payment.due', { amount: formatMoney(it.amount_due, it.currency) }),
              ])}
              trailing={<Countdown deadline={it.deadline} now={now} />}
              onPress={() => openReservation(it.uuid)}
              last={i === awaiting.items.length - 1}
            />
          ))}
        </BoardSection>
      ) : null}
      {documents ? (
        <BoardSection
          title={t('section.documents')}
          count={documents.total}
          empty={
            documents.required ? t('empty.documents', { hours: documents.window_hours }) : t('documents.not_required')
          }
          more={documents.total - documents.items.length}>
          {documents.items.map((it, i) => {
            const target = documentTarget(it);
            return (
              <BoardRow
                key={it.reservation.uuid}
                time={formatTime(it.reservation.starts_at, ZONE)}
                title={it.customer_name || it.reservation.reference}
                subtitle={joinMeta([
                  it.reservation.reference,
                  it.pickup_branch.code,
                  t('documents.handover_at', { at: formatShort(it.reservation.starts_at, ZONE) }),
                ])}
                trailing={
                  <StatusPill
                    label={it.document ? t('documents.awaiting_approval') : t('documents.not_prepared')}
                    tone={it.document ? 'progress' : 'neutral'}
                  />
                }
                onPress={() => (target.kind === 'rental' ? openRental(target.uuid) : openReservation(target.uuid))}
                last={i === documents.items.length - 1}
              />
            );
          })}
        </BoardSection>
      ) : null}
    </>
  );
}

/**
 * Home tab "Bugün": the panel home (`/t/{slug}`) for the phone. KPI chips,
 * today's handovers and returns, overdue returns and the waiting queues from
 * `GET /v1/tenant/overview` (each part only with its permission: the API
 * sends `null` otherwise) plus the badge counts. The branch chip narrows it
 * with `?branch=`; pull or coming back to the tab refreshes it.
 */
export function TodayScreen() {
  const { t } = useTranslation('today');
  const org = useSession((s) => s.organization);
  const { branchUuid } = useSelectedBranch();
  const overview = useOverview(branchUuid);
  const badges = useOverviewBadges();
  const now = useNow();
  const [pulling, setPulling] = useState(false);
  useRefetchOnFocus(overview, badges);

  const refresh = async () => {
    setPulling(true);
    try {
      await Promise.all([overview.refetch(), badges.isEnabled ? badges.refetch() : null]);
    } finally {
      setPulling(false);
    }
  };

  const data = overview.data;
  return (
    <>
      <Stack.Screen options={{ title: t('title'), headerRight: () => <TodayHeaderActions /> }} />
      <Screen refreshControl={<RefreshControl refreshing={pulling} onRefresh={() => void refresh()} />}>
        <View className="gap-0.5 px-1">
          <Text variant="headline" numberOfLines={1}>
            {org?.name ?? ''}
          </Text>
          <Text variant="callout" tone="muted">
            {formatDay(localDate(new Date(now), ZONE))}
            {data ? ` · ${t('updated_at', { at: formatTime(data.generated_at, ZONE) })}` : ''}
          </Text>
        </View>
        <BranchChip scope={data?.branch_scope} />
        <QueryState query={overview} rows={5}>
          {(d) =>
            hasAnything(d) ? (
              <>
                <KpiChips chips={kpiChips(d, badges.data)} />
                <Board data={d} now={now} />
              </>
            ) : (
              <EmptyState icon="inbox" title={t('nothing_title')} body={t('nothing_body')} />
            )
          }
        </QueryState>
      </Screen>
    </>
  );
}

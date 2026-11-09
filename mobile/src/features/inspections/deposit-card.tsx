import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api, orgHeader, unwrap } from '@/core/api/client';
import type { components } from '@/core/api/schema';
import { Permission, useCan } from '@/core/auth/permissions';
import { useSession } from '@/core/auth/session';
import { formatMoney } from '@/core/format';
import { amountText, parseAmount } from '@/core/money';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Chips } from '@/ui/chips';
import { TextArea } from '@/ui/fields';
import { Icon } from '@/ui/icon';
import { Input } from '@/ui/input';
import { Select } from '@/ui/select';
import { StatusPill, type StatusTone } from '@/ui/status-pill';
import { Text } from '@/ui/text';
import { toast } from '@/ui/toast';

import { problemText } from './api';
import { depositPayload, type DepositForm, type DepositMethod } from './deposit-model';
import { Notice } from './parts';

type RentalDeposits = components['schemas']['RentalDeposits'];
type Deposit = components['schemas']['SecurityDeposit'];

const TONES: Record<Deposit['status'], StatusTone> = {
  pending: 'progress',
  held: 'done',
  partially_captured: 'neutral',
  released: 'neutral',
  refunded: 'neutral',
  cancelled: 'neutral',
};

/** On the phone: cash, bank transfer or a POS provision. The online pre-auth page stays in the panel. */
const METHODS: DepositMethod[] = ['cash', 'bank_transfer', 'pos_preauth'];

function useRentalDeposits(rentalUuid: string, enabled: boolean) {
  const slug = useSession((s) => s.organization?.slug ?? '');
  return useQuery({
    queryKey: ['tenant', slug, 'deposits', 'rental', rentalUuid],
    enabled: !!slug && enabled,
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/v1/tenant/finance/rentals/{uuid}/deposits', {
          params: { header: orgHeader(), path: { uuid: rentalUuid } },
          signal,
        }),
      ),
  });
}

/**
 * The panel's deposit card of the handover's amounts step ("Depozito al",
 * TEC-719): the open deposit and, while none is open, taking one. Reading
 * needs `tenant.finance.deposits.read`, taking `…deposits.write`.
 */
export function DepositCard({ rentalUuid, locked }: { rentalUuid: string; locked: boolean }) {
  const { t } = useTranslation('inspections');
  const can = useCan();
  const allowed = can(Permission.TenantFinanceDepositsRead);
  const query = useRentalDeposits(rentalUuid, allowed);
  const [open, setOpen] = useState(false);
  if (!allowed) return null;
  const card = query.data;
  const current = card?.items.find((d) => d.uuid === card.open_deposit_uuid);
  return (
    <Card title={t('deposit.title')}>
      {query.isError ? <Notice tone="danger" body={problemText(query.error)} /> : null}
      {card ? (
        <>
          {current ? (
            <View className="gap-2 rounded-md border border-border p-3">
              <View className="flex-row flex-wrap items-center gap-2">
                <StatusPill label={t(`deposit.status_${current.status}`)} tone={TONES[current.status]} />
                <Text variant="footnote" tone="muted">
                  {t(`deposit.method_${current.method}`)}
                </Text>
              </View>
              <Text variant="headline" className="tabular-nums">
                {formatMoney(current.open_amount, current.currency)}
              </Text>
            </View>
          ) : card.items.length === 0 ? (
            <Text variant="callout" tone="muted">
              {Number(card.default_amount) > 0
                ? t('deposit.empty_default', { amount: formatMoney(card.default_amount, card.currency) })
                : t('deposit.empty_no_default')}
            </Text>
          ) : (
            <Text variant="callout" tone="muted">
              {t('deposit.count', { count: card.items.length })}
            </Text>
          )}
          {card.can_take && can(Permission.TenantFinanceDepositsWrite) ? (
            <Button icon="security" title={t('deposit.take')} disabled={locked} onPress={() => setOpen(true)} />
          ) : null}
          <TakeDepositSheet card={card} open={open} onClose={() => setOpen(false)} />
        </>
      ) : query.isLoading ? (
        <Text tone="muted">{t('common:loading')}</Text>
      ) : null}
    </Card>
  );
}

function TakeDepositSheet({ card, open, onClose }: { card: RentalDeposits; open: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation('inspections');
  const insets = useSafeAreaInsets();
  const slug = useSession((s) => s.organization?.slug ?? '');
  const qc = useQueryClient();
  const [form, setForm] = useState<DepositForm>(() => ({
    method: 'cash',
    amount: Number(card.default_amount) > 0 ? amountText(card.default_amount, i18n.language) : '',
    cashAccountUuid: '',
    posReference: '',
    note: '',
  }));
  const kind = form.method === 'bank_transfer' ? 'bank' : 'cash';
  const accounts = card.cash_accounts.filter((a) => a.kind === kind);
  const built = depositPayload(card.rental_uuid, form, parseAmount);
  const take = useMutation({
    mutationFn: (body: components['schemas']['SecurityDepositInput']) =>
      unwrap(api.POST('/v1/tenant/finance/deposits', { params: { header: orgHeader() }, body })),
    onSuccess: () => {
      toast.success(t('deposit.taken'));
      void qc.invalidateQueries({ queryKey: ['tenant', slug, 'deposits'] });
      void qc.invalidateQueries({ queryKey: ['tenant', slug, 'inspections'] });
      onClose();
    },
    onError: (e) => toast.error(problemText(e)),
  });
  const error = built.ok ? undefined : built.error;
  return (
    <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View className="flex-1 bg-background" style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
        <View className="flex-row items-center gap-3 border-b border-border px-4 py-3">
          <Text variant="headline" className="flex-1" numberOfLines={1}>
            {t('deposit.take_title', { reference: card.reference })}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common:close')} onPress={onClose} hitSlop={10}>
            <Icon name="close" tone="muted-foreground" size={22} />
          </Pressable>
        </View>
        <View className="flex-1 gap-4 px-4 pt-4">
          <View className="gap-1.5">
            <Text variant="footnote" tone="muted" className="font-sans-medium">
              {t('deposit.method')}
            </Text>
            <Chips
              options={METHODS.map((m) => ({ value: m, label: t(`deposit.method_${m}`) }))}
              value={form.method}
              onChange={(method) => setForm({ ...form, method, cashAccountUuid: '' })}
            />
          </View>
          <Input
            label={t('deposit.amount')}
            value={form.amount}
            inputMode="decimal"
            keyboardType="decimal-pad"
            hint={Number(card.default_amount) > 0 ? t('deposit.default_amount') : t('deposit.no_default_amount')}
            error={error === 'amount' && form.amount !== '' ? t('deposit.invalid_amount') : undefined}
            onChangeText={(amount) => setForm({ ...form, amount })}
          />
          {form.method === 'pos_preauth' ? (
            <Input
              label={t('deposit.pos_reference')}
              hint={t('deposit.pos_hint')}
              value={form.posReference}
              maxLength={64}
              onChangeText={(posReference) => setForm({ ...form, posReference })}
            />
          ) : accounts.length === 0 ? (
            <Notice tone="warning" body={t(kind === 'cash' ? 'deposit.no_till' : 'deposit.no_bank')} />
          ) : (
            <Select
              label={t(kind === 'cash' ? 'deposit.till' : 'deposit.bank_account')}
              placeholder={t('deposit.choose')}
              value={form.cashAccountUuid || null}
              options={accounts.map((a) => ({ value: a.uuid, label: `${a.code} · ${a.name}` }))}
              onChange={(cashAccountUuid) => setForm({ ...form, cashAccountUuid })}
            />
          )}
          <TextArea
            label={t('deposit.note')}
            value={form.note}
            maxLength={500}
            onChangeText={(note) => setForm({ ...form, note })}
          />
          {form.method !== 'pos_preauth' ? (
            <Text variant="footnote" tone="muted">
              {t('deposit.liability_hint')}
            </Text>
          ) : null}
        </View>
        <View className="px-4 pt-3">
          <Button
            size="lg"
            icon="security"
            title={t('deposit.take')}
            disabled={!built.ok}
            loading={take.isPending}
            onPress={() => built.ok && take.mutate(built.body)}
          />
        </View>
      </View>
    </Modal>
  );
}

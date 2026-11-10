import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Image, Platform, RefreshControl, View } from 'react-native';

import { formErrors } from '@/core/api/form-errors';
import { isApiError } from '@/core/api/errors';
import { Permission, useCan } from '@/core/auth/permissions';
import { formatCalendarDate, formatMoney, formatNumber, formatShort, localDate } from '@/core/format';
import { apiErrorMessage } from '@/core/i18n';
import { useSelectedBranch } from '@/core/tenant';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Chips } from '@/ui/chips';
import { cn } from '@/ui/cn';
import { DateField } from '@/ui/date-field';
import { EmptyState } from '@/ui/empty-state';
import { TextArea } from '@/ui/fields';
import { Input } from '@/ui/input';
import { List, ListRow, SectionHeader } from '@/ui/list';
import { QueryState } from '@/ui/query-state';
import { ReasonForm } from '@/ui/reason-form';
import { FormScreen, Screen } from '@/ui/screen';
import { SearchField } from '@/ui/search-field';
import { Select } from '@/ui/select';
import { StatusPill } from '@/ui/status-pill';
import { Text } from '@/ui/text';
import { toast } from '@/ui/toast';

import {
  uploadReceipt,
  useCashAccounts,
  useExpense,
  useExpenseCategories,
  useSaveExpense,
  useUploadReceipt,
  useVoidExpense,
  type Expense,
  type ReceiptFile,
} from './api';
import {
  expenseCreateRequest,
  expenseDefaults,
  expenseEditable,
  expensePatchRequest,
  validateExpense,
  VAT_RATES,
  type Errors,
  type ExpenseValues,
} from './model';
import { pickReceipt } from './pick-receipt';
import { openReceipt } from './receipt-file';
import { VehiclePicker } from './vehicle-picker';

const NONE = '__none__';

/** Camera or library, then the callback; errors become a toast. */
function useReceiptPicker(onPicked: (file: ReceiptFile) => void) {
  const { t } = useTranslation('fleet_ops_app');
  const take = async (source: 'camera' | 'library') => {
    const r = await pickReceipt(source);
    if (r.ok) return onPicked(r.file);
    if (r.reason === 'denied') toast.error(t(source === 'camera' ? 'camera_denied' : 'library_denied'));
    else if (r.reason === 'too_large') toast.error(t('receipt_too_large'));
    else if (r.reason === 'bad_type') toast.error(t('receipt_bad_type'));
    else if (r.reason === 'failed') toast.error(t('receipt_failed'));
  };
  return take;
}

function ReceiptButtons({ onPick, disabled }: { onPick: (s: 'camera' | 'library') => void; disabled?: boolean }) {
  const { t } = useTranslation('fleet_ops_app');
  return (
    <View className="flex-row flex-wrap gap-2">
      {Platform.OS !== 'web' ? (
        <Button
          title={t('receipt_camera')}
          icon="camera"
          variant="secondary"
          disabled={disabled}
          onPress={() => onPick('camera')}
        />
      ) : null}
      <Button
        title={t('receipt_library')}
        icon="photos"
        variant="secondary"
        disabled={disabled}
        onPress={() => onPick('library')}
      />
    </View>
  );
}

// --- detail ------------------------------------------------------------------

/** "Gider": amounts, where it belongs, the paying account and the receipt (opened through the API). */
export function ExpenseScreen({ uuid }: { uuid: string }) {
  const { t } = useTranslation(['fleet_ops_app', 'finance']);
  const can = useCan();
  const query = useExpense(uuid);
  const notFound = isApiError(query.error) && query.error.status === 404;
  if (!can(Permission.TenantFinanceExpensesRead)) {
    return <EmptyState icon="security" title={t('finance:forbidden')} />;
  }
  return (
    <>
      <Stack.Screen options={{ title: t('expense_title') }} />
      {notFound && !query.data ? (
        <EmptyState icon="wallet" title={t('expense_not_found')} />
      ) : (
        <Screen
          refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}>
          <QueryState query={query}>{(e) => <ExpenseCard expense={e} />}</QueryState>
        </Screen>
      )}
    </>
  );
}

function ExpenseCard({ expense: e }: { expense: Expense }) {
  const { t } = useTranslation(['fleet_ops_app', 'finance']);
  const can = useCan();
  const canWrite = can(Permission.TenantFinanceExpensesWrite) && expenseEditable(e);
  const upload = useUploadReceipt(e.uuid);
  const [opening, setOpening] = useState(false);
  const pick = useReceiptPicker((file) =>
    upload.mutate(file, {
      onSuccess: () => toast.success(t('finance:toast.attachment_uploaded')),
      onError: (err) => toast.error(apiErrorMessage(err)),
    }),
  );
  const voided = e.status === 'void';
  const actor = e.created_by ? `${e.created_by.name} ${e.created_by.surname}`.trim() || e.created_by.email : null;
  const rows: {
    icon: 'wallet' | 'calendar' | 'building' | 'car' | 'card' | 'user' | 'document';
    title: string;
    value: string;
    onPress?: () => void;
  }[] = [
    { icon: 'calendar', title: t('finance:fields.date'), value: formatCalendarDate(e.expense_date) },
    { icon: 'building', title: t('finance:fields.branch'), value: e.branch?.name ?? t('finance:head_office') },
    {
      icon: 'car',
      title: t('finance:fields.vehicle'),
      value: e.vehicle?.code ?? t('finance:fields.no_vehicle'),
      onPress:
        e.vehicle && can(Permission.TenantVehiclesRead) ? () => router.push(`/vehicle/${e.vehicle?.uuid}`) : undefined,
    },
    { icon: 'card', title: t('finance:fields.paid_from'), value: e.cash_account?.name ?? t('finance:fields.unpaid') },
    ...(e.supplier_name
      ? [{ icon: 'user' as const, title: t('finance:fields.supplier_name'), value: e.supplier_name }]
      : []),
    ...(e.document_no
      ? [{ icon: 'document' as const, title: t('finance:fields.document_no'), value: e.document_no }]
      : []),
    ...(actor
      ? [{ icon: 'user' as const, title: t('created_by'), value: `${actor} · ${formatShort(e.created_at)}` }]
      : []),
  ];

  return (
    <>
      <Card>
        <View className="flex-row items-start gap-3">
          <View className="flex-1 gap-1">
            <Text variant="footnote" tone="muted">
              {e.category.name}
            </Text>
            <Text variant="title" className={cn('font-sans-bold tabular-nums', voided && 'line-through')}>
              {formatMoney(e.total_amount, e.currency)}
            </Text>
            <Text variant="footnote" tone="muted" className="tabular-nums">
              {t('net_vat', {
                net: formatMoney(e.net_amount, e.currency),
                rate: formatNumber(e.vat_rate, 2),
                vat: formatMoney(e.vat_amount, e.currency),
              })}
            </Text>
          </View>
          <StatusPill label={t(`finance:expense_status.${e.status}`)} tone={voided ? 'problem' : 'done'} />
        </View>
        {e.description ? <Text className="pt-2">{e.description}</Text> : null}
        {e.supplier_invoice ? (
          <Text variant="footnote" tone="muted" className="pt-2">
            {t('finance:expenses.from_invoice')}
          </Text>
        ) : null}
        {voided && e.void_reason ? (
          <Text variant="footnote" tone="danger" className="pt-2">
            {t('finance:fields.void_reason')}: {e.void_reason}
          </Text>
        ) : null}
      </Card>

      {canWrite ? (
        <View className="flex-row flex-wrap gap-2">
          <Button
            title={t('finance:actions.edit')}
            icon="edit"
            variant="secondary"
            onPress={() => router.push(`/finance/expenses/${e.uuid}/edit`)}
          />
          <Button
            title={t('finance:actions.void')}
            icon="cancel"
            variant="outline"
            onPress={() => router.push(`/finance/expenses/${e.uuid}/void`)}
          />
        </View>
      ) : null}

      <View>
        <SectionHeader title={t('details')} />
        <List>
          {rows.map((r, i) => (
            <ListRow
              key={r.title}
              icon={r.icon}
              title={r.value}
              subtitle={r.title}
              onPress={r.onPress}
              last={i === rows.length - 1}
            />
          ))}
        </List>
      </View>

      <View className="gap-3">
        <SectionHeader title={t('finance:fields.attachment')} />
        {e.attachment ? (
          <List>
            <ListRow
              icon="document"
              title={e.attachment.name}
              subtitle={`${formatNumber(e.attachment.size_bytes / 1024, 0)} KB · ${t('open_receipt')}`}
              onPress={
                opening
                  ? undefined
                  : async () => {
                      setOpening(true);
                      try {
                        await openReceipt(e);
                      } catch {
                        toast.error(t('receipt_open_failed'));
                      } finally {
                        setOpening(false);
                      }
                    }
              }
              last
            />
          </List>
        ) : (
          <Text variant="footnote" tone="muted">
            {t('no_receipt')}
          </Text>
        )}
        {can(Permission.TenantFinanceExpensesWrite) && !voided ? (
          <>
            <ReceiptButtons onPick={(s) => void pick(s)} disabled={upload.isPending} />
            {upload.isPending ? (
              <Text variant="footnote" tone="muted">
                {t('receipt_uploading')}
              </Text>
            ) : (
              <Text variant="footnote" tone="muted">
                {e.attachment ? t('receipt_replace_hint') : t('finance:fields.attachment_hint')}
              </Text>
            )}
          </>
        ) : null}
      </View>
    </>
  );
}

// --- create / edit -----------------------------------------------------------

/** "Gider kaydet" / "Gideri düzenle" with the receipt photo (new expenses). */
export function ExpenseFormScreen({ uuid, vehicle }: { uuid?: string; vehicle?: string }) {
  const { t } = useTranslation(['fleet_ops_app', 'finance']);
  const can = useCan();
  const query = useExpense(uuid ?? '');
  const title = uuid ? t('finance:expenses.edit_title') : t('finance:expenses.create_title');
  if (!can(Permission.TenantFinanceExpensesWrite)) {
    return (
      <>
        <Stack.Screen options={{ title }} />
        <EmptyState icon="security" title={t('finance:forbidden')} />
      </>
    );
  }
  return (
    <>
      <Stack.Screen options={{ title }} />
      {uuid ? (
        <View className="flex-1 bg-background">
          <QueryState query={query}>
            {(e) =>
              expenseEditable(e) ? (
                <ExpenseForm expense={e} />
              ) : (
                <EmptyState icon="wallet" title={t('expense_locked')} />
              )
            }
          </QueryState>
        </View>
      ) : (
        <ExpenseForm vehicle={vehicle} />
      )}
    </>
  );
}

function ExpenseForm({ expense, vehicle }: { expense?: Expense; vehicle?: string }) {
  const { t } = useTranslation(['fleet_ops_app', 'finance']);
  const can = useCan();
  const editing = !!expense;
  const branch = useSelectedBranch();
  const today = localDate(new Date());
  const save = useSaveExpense(expense?.uuid);
  const categories = useExpenseCategories(true);
  const cash = useCashAccounts(!editing);
  const [v, setV] = useState<ExpenseValues>(() =>
    expenseDefaults(today, { vehicle_uuid: vehicle, branch_uuid: branch.branchUuid ?? undefined }, expense),
  );
  const [file, setFile] = useState<ReceiptFile | null>(null);
  const [uploading, setUploading] = useState(false);
  const [local, setLocal] = useState<Errors>({});
  const api = formErrors(save.error);
  const field = (name: string) => (local[name] ? t(local[name]) : api.fields[name]);
  const set = (patch: Partial<ExpenseValues>) => setV((s) => ({ ...s, ...patch }));
  const pick = useReceiptPicker(setFile);

  const categoryOptions = useMemo(() => {
    const items = (categories.data?.items ?? []).map((c) => ({ value: c.uuid, label: c.name }));
    // An inactive category still shows on the expense being edited.
    if (expense && !items.some((o) => o.value === expense.category.uuid))
      items.push({ value: expense.category.uuid, label: expense.category.name ?? '' });
    return items;
  }, [categories.data?.items, expense]);

  const submit = () => {
    const e = validateExpense(v, editing);
    setLocal(e);
    if (Object.keys(e).length) return;
    save.mutate(editing ? expensePatchRequest(v) : expenseCreateRequest(v), {
      onSuccess: async (saved) => {
        toast.success(t('finance:toast.expense_saved'));
        if (file) {
          setUploading(true);
          try {
            await uploadReceipt(saved.uuid, file);
            toast.success(t('finance:toast.attachment_uploaded'));
          } catch (err) {
            // The expense is saved; the receipt can be added again from its page.
            toast.error(`${t('receipt_upload_failed')} ${apiErrorMessage(err)}`);
            setUploading(false);
            router.replace(`/finance/expenses/${saved.uuid}`);
            return;
          }
          setUploading(false);
        }
        if (editing) router.back();
        else router.replace(`/finance/expenses/${saved.uuid}`);
      },
    });
  };

  return (
    <FormScreen
      footer={
        <>
          {api.message ? (
            <Text variant="footnote" tone="danger">
              {api.message}
            </Text>
          ) : null}
          <Button size="lg" title={t('common:save')} loading={save.isPending || uploading} onPress={submit} />
        </>
      }>
      <Text tone="muted">{t('finance:expenses.form_description')}</Text>
      <Select
        label={t('finance:fields.category')}
        placeholder={t('finance:fields.choose_category')}
        value={v.category_uuid || null}
        options={categoryOptions}
        onChange={(category_uuid) => set({ category_uuid })}
        error={field('category_uuid')}
      />
      <DateField
        label={t('finance:fields.date')}
        value={v.expense_date}
        onChange={(expense_date) => set({ expense_date })}
        error={field('expense_date')}
      />
      <Input
        label={t('finance:fields.total_with_vat')}
        value={v.total_amount}
        onChangeText={(total_amount) => set({ total_amount })}
        keyboardType="decimal-pad"
        editable={!editing}
        trailing={<Text tone="muted">₺</Text>}
        error={field('total_amount')}
      />
      <View className="gap-1.5">
        <Text variant="footnote" tone="muted" className="font-sans-medium">
          {t('finance:fields.vat_rate')}
        </Text>
        {editing ? (
          <Text>%{formatNumber(v.vat_rate)}</Text>
        ) : (
          <Chips
            options={VAT_RATES.map((r) => ({ value: r, label: `%${r}` }))}
            value={v.vat_rate}
            onChange={(vat_rate) => set({ vat_rate })}
          />
        )}
      </View>
      <VehiclePicker
        label={t('finance:fields.vehicle')}
        value={v.vehicle_uuid}
        noneLabel={t('finance:fields.no_vehicle')}
        onChange={(vehicle_uuid) => set({ vehicle_uuid })}
        error={field('vehicle_uuid')}
      />
      {branch.branches.length ? (
        <Select
          label={t('finance:fields.branch')}
          value={v.branch_uuid || NONE}
          searchable={branch.branches.length > 8}
          options={[
            { value: NONE, label: t('finance:head_office') },
            ...branch.branches.map((b) => ({ value: b.uuid, label: b.name, description: b.code })),
          ]}
          onChange={(b) => set({ branch_uuid: b === NONE ? '' : b })}
          error={field('branch_uuid')}
        />
      ) : null}
      {!editing && can(Permission.TenantFinanceCashRead) ? (
        <View className="gap-1.5">
          <Select
            label={t('finance:fields.paid_from')}
            value={v.cash_account_uuid || NONE}
            options={[
              { value: NONE, label: t('finance:fields.unpaid') },
              ...(cash.data?.items ?? []).map((a) => ({
                value: a.uuid,
                label: `${a.code} · ${a.name}`,
                description: formatMoney(a.balance, a.currency),
              })),
            ]}
            onChange={(a) => set({ cash_account_uuid: a === NONE ? '' : a })}
            error={field('cash_account_uuid')}
          />
          <Text variant="footnote" tone="muted">
            {t('finance:fields.paid_from_hint')}
          </Text>
        </View>
      ) : null}
      <Input
        label={t('finance:fields.supplier_name')}
        value={v.supplier_name}
        onChangeText={(supplier_name) => set({ supplier_name })}
        maxLength={255}
        error={field('supplier_name')}
      />
      <Input
        label={t('finance:fields.document_no')}
        value={v.document_no}
        onChangeText={(document_no) => set({ document_no })}
        maxLength={64}
        error={field('document_no')}
      />
      <TextArea
        label={t('finance:fields.description')}
        value={v.description}
        onChangeText={(description) => set({ description })}
        maxLength={1000}
        error={field('description')}
      />
      {!editing ? (
        <View className="gap-2">
          <Text variant="footnote" tone="muted" className="font-sans-medium">
            {t('finance:fields.attachment')}
          </Text>
          {file ? (
            <View className="flex-row items-center gap-3 rounded-lg border border-border bg-card p-2">
              <Image
                source={{ uri: file.uri }}
                accessibilityLabel={t('receipt_preview')}
                className="h-20 w-16 rounded-md bg-muted"
                resizeMode="cover"
              />
              <Text variant="footnote" className="flex-1" numberOfLines={2}>
                {file.name}
              </Text>
              <Button title={t('common:delete')} icon="trash" variant="ghost" onPress={() => setFile(null)} />
            </View>
          ) : null}
          <ReceiptButtons onPick={(s) => void pick(s)} />
          <Text variant="footnote" tone="muted">
            {t('receipt_hint')}
          </Text>
        </View>
      ) : null}
    </FormScreen>
  );
}

// --- void --------------------------------------------------------------------

/** "Gideri iptal et": with a reason; a payment from a cash account is reversed. */
export function VoidExpenseScreen({ uuid }: { uuid: string }) {
  const { t } = useTranslation(['fleet_ops_app', 'finance']);
  const can = useCan();
  const query = useExpense(uuid);
  const voidIt = useVoidExpense(uuid);
  return (
    <>
      <Stack.Screen options={{ title: t('finance:expenses.void_title') }} />
      {!can(Permission.TenantFinanceExpensesWrite) ? (
        <EmptyState icon="security" title={t('finance:forbidden')} />
      ) : (
        <View className="flex-1 bg-background">
          <QueryState query={query}>
            {(e) =>
              expenseEditable(e) ? (
                <ReasonForm
                  description={t('finance:expenses.void_description', {
                    amount: formatMoney(e.total_amount, e.currency),
                  })}
                  label={t('finance:fields.reason')}
                  submitTitle={t('finance:actions.void')}
                  destructive
                  pending={voidIt.isPending}
                  error={voidIt.error}
                  onSubmit={(reason) =>
                    voidIt.mutate(reason, {
                      onSuccess: () => {
                        toast.success(t('finance:toast.expense_voided'));
                        router.back();
                      },
                    })
                  }
                />
              ) : (
                <EmptyState icon="wallet" title={t('expense_locked')} />
              )
            }
          </QueryState>
        </View>
      )}
    </>
  );
}

// --- categories (read) -------------------------------------------------------

/** "Gider kategorileri", read-only: names, codes and how many expenses use each. Changes stay on the panel. */
export function ExpenseCategoriesScreen() {
  const { t } = useTranslation(['fleet_ops_app', 'finance']);
  const can = useCan();
  const [q, setQ] = useState('');
  const query = useExpenseCategories(false);
  const items = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase();
    const all = query.data?.items ?? [];
    return needle ? all.filter((c) => `${c.name} ${c.code}`.toLocaleLowerCase().includes(needle)) : all;
  }, [q, query.data?.items]);
  if (!can(Permission.TenantFinanceExpensesRead)) {
    return <EmptyState icon="security" title={t('finance:forbidden')} />;
  }
  return (
    <>
      <Stack.Screen options={{ title: t('finance:categories.title') }} />
      <FlatList
        data={query.data ? items : []}
        keyExtractor={(c) => c.uuid}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        className="flex-1 bg-background"
        contentContainerClassName="px-4 pb-10 pt-2"
        ListHeaderComponent={
          <View className="gap-3 pb-3">
            <Text variant="footnote" tone="muted">
              {t('finance:categories.description')} {t('categories_on_web')}
            </Text>
            <SearchField value={q} onChangeText={setQ} placeholder={t('common:search')} />
          </View>
        }
        renderItem={({ item: c, index }) => (
          <View
            className={cn(
              'overflow-hidden border-x border-border bg-card',
              index === 0 && 'rounded-t-lg border-t',
              index === items.length - 1 && 'rounded-b-lg border-b',
            )}>
            <ListRow
              icon="wallet"
              title={c.name}
              subtitle={`${c.code} · ${t('expense_count', { count: c.expense_count })}`}
              trailing={
                !c.is_active ? (
                  <StatusPill label={t('finance:categories.inactive')} tone="neutral" />
                ) : c.is_system ? (
                  <StatusPill label={t('finance:categories.system')} tone="done" />
                ) : undefined
              }
              last={index === items.length - 1}
            />
          </View>
        )}
        ListEmptyComponent={
          query.data ? (
            <EmptyState icon="inbox" title={q.trim() ? t('common:no_results') : t('finance:categories.empty')} />
          ) : (
            <QueryState query={query}>{() => null}</QueryState>
          )
        }
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
      />
    </>
  );
}

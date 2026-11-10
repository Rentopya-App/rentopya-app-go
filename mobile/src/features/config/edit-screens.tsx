import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { formErrors } from '@/core/api/form-errors';
import { Permission } from '@/core/auth/permissions';
import { Button } from '@/ui/button';
import { SwitchRow, TextArea } from '@/ui/fields';
import { Input } from '@/ui/input';
import { QueryState } from '@/ui/query-state';
import { FormScreen } from '@/ui/screen';
import { Text } from '@/ui/text';
import { toast } from '@/ui/toast';

import {
  useBranch,
  useExtra,
  useExtraStock,
  usePatchBranch,
  usePatchServicePoint,
  useSaveExtraStock,
  useServicePoints,
  type Branch,
  type ExtraStockRow,
  type ServicePoint,
} from './api';
import {
  branchQuickDefaults,
  branchQuickRequest,
  servicePointDefaults,
  servicePointRequest,
  stockChanges,
  validateBranchQuick,
  validateServicePoint,
  validStock,
  type BranchQuickValues,
  type Errors,
  type ServicePointValues,
} from './lib';
import { Gate } from './parts';

/** Client errors (i18n keys) win over the API's field messages; the rest goes above the button. */
function useErrors(local: Errors, error: unknown) {
  const { t } = useTranslation();
  const api = formErrors(error);
  return { field: (name: string) => (local[name] ? t(local[name]) : api.fields[name]), message: api.message };
}

function Footer({ message, ...button }: { message?: string } & React.ComponentProps<typeof Button>) {
  return (
    <>
      {message ? (
        <Text variant="footnote" tone="danger">
          {message}
        </Text>
      ) : null}
      <Button size="lg" {...button} />
    </>
  );
}

// ---------------------------------------------------------------- branch basics

/** The panel's quick edit: name, phone, e-mail, preparation time, active. Hours and address stay in the panel. */
export function BranchEditScreen({ uuid }: { uuid: string }) {
  const { t } = useTranslation('config_app');
  const branch = useBranch(uuid);
  return (
    <>
      <Stack.Screen options={{ title: t('edit_basics') }} />
      <Gate perm={Permission.TenantBranchesWrite}>
        <View className="flex-1 bg-background">
          <QueryState query={branch}>{(b) => <BranchForm branch={b} />}</QueryState>
        </View>
      </Gate>
    </>
  );
}

function BranchForm({ branch }: { branch: Branch }) {
  const { t } = useTranslation(['branches', 'config_app']);
  const save = usePatchBranch(branch.uuid);
  const [v, setV] = useState<BranchQuickValues>(() => branchQuickDefaults(branch));
  const [local, setLocal] = useState<Errors>({});
  const err = useErrors(local, save.error);
  const set = (patch: Partial<BranchQuickValues>) => setV((s) => ({ ...s, ...patch }));
  const submit = () => {
    const e = validateBranchQuick(v);
    setLocal(e);
    if (Object.keys(e).length) return;
    save.mutate(branchQuickRequest(v), {
      onSuccess: () => {
        toast.success(t('config_app:toast.saved'));
        router.back();
      },
    });
  };
  return (
    <FormScreen
      footer={<Footer message={err.message} title={t('common:save')} loading={save.isPending} onPress={submit} />}>
      <Text tone="muted">{`${branch.code} · ${branch.name}`}</Text>
      <Input
        label={t('fields.name')}
        value={v.name}
        onChangeText={(name) => set({ name })}
        maxLength={255}
        error={err.field('name')}
      />
      <Input
        label={t('fields.phone')}
        value={v.phone}
        onChangeText={(phone) => set({ phone })}
        keyboardType="phone-pad"
        maxLength={32}
        error={err.field('phone')}
      />
      <Input
        label={t('fields.email')}
        value={v.email}
        onChangeText={(email) => set({ email })}
        keyboardType="email-address"
        autoCapitalize="none"
        error={err.field('email')}
      />
      <Input
        label={t('fields.prep_minutes')}
        hint={t('fields.prep_minutes_hint')}
        value={v.prep_minutes}
        onChangeText={(prep_minutes) => set({ prep_minutes })}
        keyboardType="number-pad"
        error={err.field('prep_minutes')}
      />
      <SwitchRow
        label={t('fields.is_active')}
        description={t('fields.is_active_hint')}
        value={v.is_active}
        onChange={(is_active) => set({ is_active })}
      />
    </FormScreen>
  );
}

// ---------------------------------------------------------------- delivery / service point basics

/** Basic fields of a service point; hours, districts, location and the delivery extra stay in the panel. */
export function ServicePointEditScreen({ uuid, pointUuid }: { uuid: string; pointUuid: string }) {
  const { t } = useTranslation('branches');
  const points = useServicePoints(uuid);
  return (
    <>
      <Stack.Screen options={{ title: t('service_points.edit_title') }} />
      <Gate perm={Permission.TenantBranchesWrite}>
        <View className="flex-1 bg-background">
          <QueryState query={points}>
            {(list) => {
              const p = list.items.find((x) => x.uuid === pointUuid);
              return p ? (
                <ServicePointForm branchUuid={uuid} point={p} />
              ) : (
                <Text tone="muted">{t('detail_not_found')}</Text>
              );
            }}
          </QueryState>
        </View>
      </Gate>
    </>
  );
}

function ServicePointForm({ branchUuid, point }: { branchUuid: string; point: ServicePoint }) {
  const { t } = useTranslation(['branches', 'config_app']);
  const save = usePatchServicePoint(branchUuid, point.uuid);
  const [v, setV] = useState<ServicePointValues>(() => servicePointDefaults(point));
  const [local, setLocal] = useState<Errors>({});
  const err = useErrors(local, save.error);
  const set = (patch: Partial<ServicePointValues>) => setV((s) => ({ ...s, ...patch }));
  const submit = () => {
    const e = validateServicePoint(v);
    setLocal(e);
    if (Object.keys(e).length) return;
    save.mutate(servicePointRequest(v), {
      onSuccess: () => {
        toast.success(t('service_points.toast.updated'));
        router.back();
      },
    });
  };
  return (
    <FormScreen
      footer={<Footer message={err.message} title={t('common:save')} loading={save.isPending} onPress={submit} />}>
      <Text tone="muted">{t(`service_points.types.${point.type}`)}</Text>
      <Input
        label={t('service_points.fields.name')}
        value={v.name}
        onChangeText={(name) => set({ name })}
        maxLength={255}
        error={err.field('name')}
      />
      <TextArea
        label={t('service_points.fields.address')}
        value={v.description}
        onChangeText={(description) => set({ description })}
        maxLength={2000}
        error={err.field('description')}
      />
      <Input
        label={t('service_points.fields.extra_fee')}
        hint={t('service_points.fields.extra_fee_hint')}
        value={v.extra_fee}
        onChangeText={(extra_fee) => set({ extra_fee })}
        keyboardType="decimal-pad"
        error={err.field('extra_fee')}
      />
      <Input
        label={t('service_points.fields.min_notice')}
        value={v.min_notice_minutes}
        onChangeText={(min_notice_minutes) => set({ min_notice_minutes })}
        keyboardType="number-pad"
        error={err.field('min_notice_minutes')}
      />
      <SwitchRow
        label={t('service_points.fields.online_selectable')}
        value={v.online_selectable}
        onChange={(online_selectable) => set({ online_selectable })}
      />
      <SwitchRow
        label={t('service_points.fields.delivery_enabled')}
        description={t('service_points.fields.delivery_enabled_hint')}
        value={v.delivery_enabled}
        onChange={(delivery_enabled) => set({ delivery_enabled })}
      />
      <SwitchRow
        label={t('service_points.fields.is_active')}
        value={v.is_active}
        onChange={(is_active) => set({ is_active })}
      />
    </FormScreen>
  );
}

// ---------------------------------------------------------------- extra stock

/** Branch counts of a physical extra; only changed rows are saved (the panel's stock tab). */
export function ExtraStockScreen({ uuid }: { uuid: string }) {
  const { t } = useTranslation('extras');
  const extra = useExtra(uuid);
  const stock = useExtraStock(uuid);
  return (
    <>
      <Stack.Screen options={{ title: t('stock.title') }} />
      <Gate perm={Permission.TenantExtrasWrite}>
        <View className="flex-1 bg-background">
          <QueryState query={stock}>
            {(s) =>
              extra.data && !extra.data.is_physical ? (
                <Text tone="muted">{t('stock.not_physical')}</Text>
              ) : (
                <StockForm uuid={uuid} rows={s.items} />
              )
            }
          </QueryState>
        </View>
      </Gate>
    </>
  );
}

function StockForm({ uuid, rows }: { uuid: string; rows: ExtraStockRow[] }) {
  const { t } = useTranslation(['extras', 'config_app']);
  const save = useSaveExtraStock(uuid);
  const [grid, setGrid] = useState<Record<string, string>>({});
  const { items, invalid } = stockChanges(rows, grid);
  const err = formErrors(save.error);
  const submit = () =>
    save.mutate(
      { items },
      {
        onSuccess: (r) => {
          const warnings = (r as { warnings?: unknown[] }).warnings ?? [];
          toast.success(warnings.length ? t('extras:stock.over_committed') : t('config_app:toast.saved'));
          router.back();
        },
      },
    );
  return (
    <FormScreen
      footer={
        <Footer
          message={err.message}
          title={t('extras:stock.save', { count: items.length })}
          disabled={!items.length || invalid.length > 0}
          loading={save.isPending}
          onPress={submit}
        />
      }>
      <Text tone="muted">{t('extras:stock.help')}</Text>
      {rows.map((r) => {
        const value = grid[r.branch.uuid] ?? String(r.quantity);
        return (
          <Input
            key={r.branch.uuid}
            label={`${r.branch.name}${r.branch_active ? '' : ` · ${t('extras:stock.branch_inactive')}`}`}
            hint={t('config_app:stock_hint', { inUse: r.in_use_now, peak: r.peak_committed })}
            value={value}
            onChangeText={(text) => setGrid((g) => ({ ...g, [r.branch.uuid]: text }))}
            keyboardType="number-pad"
            error={
              !validStock(value)
                ? t('config_app:validation.stock')
                : Number(value) < r.peak_committed
                  ? t('extras:stock.over_committed')
                  : undefined
            }
          />
        );
      })}
    </FormScreen>
  );
}

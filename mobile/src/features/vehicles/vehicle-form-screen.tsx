import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { formErrors } from '@/core/api/form-errors';
import { Permission, useCan } from '@/core/auth/permissions';
import { useBranches } from '@/core/tenant';
import { useDebounced } from '@/core/use-debounced';
import { Button } from '@/ui/button';
import { cn } from '@/ui/cn';
import { EmptyState } from '@/ui/empty-state';
import { FieldGroup, SwitchRow } from '@/ui/fields';
import { Icon } from '@/ui/icon';
import { Input } from '@/ui/input';
import { QueryState } from '@/ui/query-state';
import { FormScreen } from '@/ui/screen';
import { OptionSheet, Select } from '@/ui/select';
import { Text } from '@/ui/text';
import { toast } from '@/ui/toast';

import { useCatalog, useSaveVehicle, useVehicle, type Vehicle } from './api';
import {
  fallbackYears,
  validateVehicle,
  vehicleFormDefaults,
  vehicleRequest,
  VEHICLE_STATUSES,
  type Errors,
  type VehicleFormValues,
} from './forms';
import { statusKey } from './labels';

const SAME = '__same__';

/** One level of the brand → model → type cascade: a row that opens a server-searched sheet. */
function CatalogPicker({
  label,
  level,
  parent,
  value,
  current,
  disabled,
  error,
  onPick,
}: {
  label: string;
  level: 'brands' | 'models' | 'types';
  parent: string;
  value: string;
  current: string;
  disabled?: boolean;
  error?: string;
  onPick: (option: { value: string; label: string; years: number[] }) => void;
}) {
  const { t } = useTranslation('vehicles_app');
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const search = useDebounced(q);
  const options = useCatalog(level, parent, search, open && (level === 'brands' || !!parent));
  const items = options.data ?? [];
  return (
    <View className="gap-1.5">
      <Text variant="footnote" tone="muted" className="font-sans-medium">
        {label}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: current }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        className={cn(
          'min-h-[52px] flex-row items-center gap-2 rounded-lg border bg-card px-4 active:opacity-80',
          error ? 'border-destructive' : 'border-border',
          disabled && 'opacity-50',
        )}>
        <Text className="flex-1" numberOfLines={1} tone={current ? 'default' : 'muted'}>
          {current || t('catalog_pick')}
        </Text>
        <Icon name="chevronDown" tone="muted-foreground" size={18} />
      </Pressable>
      {error ? (
        <Text variant="footnote" tone="danger">
          {error}
        </Text>
      ) : null}
      <OptionSheet
        visible={open}
        title={label}
        options={items}
        value={value}
        onSearch={setQ}
        loading={options.isFetching}
        onClose={() => setOpen(false)}
        onPick={(v) => {
          setOpen(false);
          const option = items.find((o) => o.value === v);
          if (option) onPick(option);
        }}
      />
    </View>
  );
}

/** Create (`uuid` empty) or edit a vehicle: the fields the panel requires plus the readings. */
export function VehicleFormScreen({ uuid }: { uuid?: string }) {
  const { t } = useTranslation('vehicles');
  const can = useCan();
  const vehicle = useVehicle(uuid ?? '');
  const title = uuid
    ? vehicle.data
      ? t('edit_title_with_plate', { plate: vehicle.data.plate })
      : t('edit_title')
    : t('create_title');
  return (
    <>
      <Stack.Screen options={{ title }} />
      {!can(Permission.TenantVehiclesWrite) ? (
        <EmptyState icon="security" title={t('common:forbidden')} />
      ) : uuid ? (
        <View className="flex-1 bg-background">
          <QueryState query={vehicle}>{(v) => <VehicleForm vehicle={v} />}</QueryState>
        </View>
      ) : (
        <VehicleForm />
      )}
    </>
  );
}

function VehicleForm({ vehicle }: { vehicle?: Vehicle }) {
  const { t } = useTranslation(['vehicles', 'vehicles_app']);
  const save = useSaveVehicle(vehicle?.uuid);
  const branches = useBranches();
  const [v, setV] = useState<VehicleFormValues>(() => vehicleFormDefaults(vehicle));
  const [local, setLocal] = useState<Errors>({});
  const api = formErrors(save.error);
  const field = (name: string) => (local[name] ? t(local[name]) : api.fields[name]);
  const set = (patch: Partial<VehicleFormValues>) => setV((s) => ({ ...s, ...patch }));

  const branchOptions = (branches.data?.items ?? []).map((b) => ({
    value: b.uuid,
    label: b.name,
    description: b.code,
  }));
  // An edited vehicle keeps its branches even when they are outside the active list.
  for (const b of vehicle ? [vehicle.home_branch, vehicle.current_branch] : [])
    if (!branchOptions.some((o) => o.value === b.uuid))
      branchOptions.push({ value: b.uuid, label: b.name, description: b.code });
  const years =
    !v.manual_entry && v.type_years.length ? [...v.type_years].sort((a, b) => b - a) : fallbackYears(new Date());

  const submit = () => {
    const e = validateVehicle(v);
    setLocal(e);
    if (Object.keys(e).length) {
      toast.error(t('common:check_fields'));
      return;
    }
    save.mutate(vehicleRequest(v, vehicle ? 'edit' : 'create'), {
      onSuccess: (saved) => {
        toast.success(vehicle ? t('toast.updated') : t('toast.created'));
        if (vehicle) router.back();
        else router.replace(`/vehicle/${saved.uuid}`);
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
          <Button size="lg" title={t('actions.save')} loading={save.isPending} onPress={submit} />
        </>
      }>
      <FieldGroup title={t('form.section_identity')}>
        <Input
          label={t('fields.plate')}
          value={v.plate}
          onChangeText={(plate) => set({ plate })}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="34 ABC 123"
          error={field('plate')}
        />
        <Input
          label={t('fields.vin')}
          hint={t('fields.vin_hint')}
          value={v.vin}
          onChangeText={(vin) => set({ vin })}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={20}
          error={field('vin')}
        />
        <SwitchRow
          label={t('fields.manual_entry')}
          description={t('fields.manual_entry_hint')}
          value={v.manual_entry}
          onChange={(manual_entry) => set({ manual_entry })}
        />
        {v.manual_entry ? (
          <>
            <Input
              label={t('fields.brand')}
              value={v.manual_brand}
              onChangeText={(manual_brand) => set({ manual_brand })}
              maxLength={128}
              error={field('manual_brand')}
            />
            <Input
              label={t('fields.model')}
              value={v.manual_model}
              onChangeText={(manual_model) => set({ manual_model })}
              maxLength={128}
              error={field('manual_model')}
            />
            <Input
              label={t('fields.type')}
              value={v.manual_type}
              onChangeText={(manual_type) => set({ manual_type })}
              maxLength={255}
              error={field('manual_type')}
            />
          </>
        ) : (
          <>
            <CatalogPicker
              label={t('fields.brand')}
              level="brands"
              parent=""
              value={v.brand_uuid}
              current={v.brand_label}
              onPick={(o) =>
                set({
                  brand_uuid: o.value,
                  brand_label: o.label,
                  model_uuid: '',
                  model_label: '',
                  catalog_type_uuid: '',
                  type_label: '',
                  type_years: [],
                })
              }
            />
            <CatalogPicker
              label={t('fields.model')}
              level="models"
              parent={v.brand_uuid}
              value={v.model_uuid}
              current={v.model_label}
              disabled={!v.brand_uuid}
              onPick={(o) =>
                set({
                  model_uuid: o.value,
                  model_label: o.label,
                  catalog_type_uuid: '',
                  type_label: '',
                  type_years: [],
                })
              }
            />
            <CatalogPicker
              label={t('fields.type')}
              level="types"
              parent={v.model_uuid}
              value={v.catalog_type_uuid}
              current={v.type_label}
              disabled={!v.model_uuid}
              error={field('catalog_type_uuid')}
              onPick={(o) =>
                set({
                  catalog_type_uuid: o.value,
                  type_label: o.label,
                  type_years: o.years,
                  // A year the type does not have is cleared, as on the panel.
                  model_year:
                    o.years.length && v.model_year && !o.years.includes(Number(v.model_year)) ? '' : v.model_year,
                })
              }
            />
          </>
        )}
        <Select
          label={t('fields.model_year')}
          placeholder={t('fields.model_year_placeholder')}
          value={v.model_year || null}
          searchable
          options={years.map((y) => ({ value: String(y), label: String(y) }))}
          onChange={(model_year) => set({ model_year })}
          error={field('model_year')}
        />
        <Input
          label={t('fields.color')}
          value={v.color}
          onChangeText={(color) => set({ color })}
          maxLength={64}
          error={field('color')}
        />
      </FieldGroup>

      <FieldGroup title={t('form.section_location')}>
        <Select
          label={t('fields.home_branch')}
          placeholder={t('fields.branch_placeholder')}
          value={v.home_branch_uuid || null}
          options={branchOptions}
          onChange={(home_branch_uuid) => set({ home_branch_uuid })}
          error={field('home_branch_uuid')}
        />
        <Select
          label={t('fields.current_branch')}
          value={v.current_branch_uuid || SAME}
          options={[{ value: SAME, label: t('fields.current_branch_placeholder') }, ...branchOptions]}
          onChange={(c) => set({ current_branch_uuid: c === SAME ? '' : c })}
          error={field('current_branch_uuid')}
        />
      </FieldGroup>

      <FieldGroup title={t('form.section_service')}>
        <Input
          label={t('fields.odometer_km')}
          value={v.odometer_km}
          onChangeText={(odometer_km) => set({ odometer_km })}
          keyboardType="number-pad"
          error={field('odometer_km')}
        />
        <Input
          label={t('fields.fuel_level')}
          value={v.fuel_level}
          onChangeText={(fuel_level) => set({ fuel_level })}
          keyboardType="number-pad"
          error={field('fuel_level')}
        />
        {vehicle ? null : (
          <Select
            label={t('fields.initial_status')}
            value={v.status}
            options={VEHICLE_STATUSES.map((s) => ({ value: s, label: t(statusKey(s)) }))}
            onChange={(status) => set({ status })}
          />
        )}
      </FieldGroup>
      <Text variant="footnote" tone="muted">
        {t('vehicles_app:form_more_on_web')}
      </Text>
    </FormScreen>
  );
}

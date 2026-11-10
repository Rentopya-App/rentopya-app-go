import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useBranches } from '@/core/tenant';
import { DateField } from '@/ui/date-field';
import { Select } from '@/ui/select';
import { Text } from '@/ui/text';
import { TimeStrip } from '@/ui/time-strip';

import { timeOptions } from '@/features/reservations/lib';
import type { SearchError, SearchForm } from './lib';

export function DateTimeField({
  label,
  day,
  time,
  onDay,
  onTime,
  min,
  error,
}: {
  label: string;
  day: string;
  time: string;
  onDay: (d: string) => void;
  onTime: (t: string) => void;
  min?: string;
  error?: string;
}) {
  return (
    <View className="gap-2">
      <DateField label={`${label} · ${time}`} value={day} onChange={onDay} min={min} error={error} />
      <TimeStrip value={time} onChange={onTime} times={timeOptions(time)} />
    </View>
  );
}

const SAME = '__same__';

/**
 * Pick-up / return branch and the range of an availability or quote search
 * (the panel's `AvailabilitySearchForm`), as wall clock in the organization
 * zone. Billing days and the 24-hour rule are the API's answer.
 */
export function SearchFields({
  form,
  onChange,
  error,
}: {
  form: SearchForm;
  onChange: (f: SearchForm) => void;
  error: SearchError;
}) {
  const { t } = useTranslation('availability');
  const branches = useBranches();
  const options = (branches.data?.items ?? []).map((b) => ({ value: b.uuid, label: `${b.code} · ${b.name}` }));
  const set = (patch: Partial<SearchForm>) => onChange({ ...form, ...patch });
  return (
    <View className="gap-4">
      <Select
        label={t('fields.pickup_branch')}
        placeholder={t('fields.branch_placeholder')}
        value={form.pickup || null}
        options={options}
        onChange={(pickup) => set({ pickup })}
        searchable={options.length > 8}
        error={error === 'pickup' ? t('validation.pickup') : undefined}
      />
      <Select
        label={t('fields.return_branch')}
        value={form.ret || SAME}
        options={[{ value: SAME, label: t('fields.same_branch') }, ...options]}
        onChange={(v) => set({ ret: v === SAME ? '' : v })}
        searchable={options.length > 8}
      />
      <DateTimeField
        label={t('fields.starts_at')}
        day={form.startDay}
        time={form.startTime}
        onDay={(startDay) => set({ startDay, endDay: form.endDay < startDay ? startDay : form.endDay })}
        onTime={(startTime) => set({ startTime })}
      />
      <DateTimeField
        label={t('fields.ends_at')}
        day={form.endDay}
        time={form.endTime}
        onDay={(endDay) => set({ endDay })}
        onTime={(endTime) => set({ endTime })}
        min={form.startDay}
        error={error === 'ends_after_start' ? t('validation.ends_after_start') : undefined}
      />
    </View>
  );
}

/** A red box with a title and an optional line (refused calls). */
export function ProblemBox({ title, body, children }: { title: string; body?: string; children?: React.ReactNode }) {
  return (
    <View className="gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3">
      <Text variant="footnote" tone="danger" className="font-sans-semibold">
        {title}
      </Text>
      {body ? <Text variant="callout">{body}</Text> : null}
      {children}
    </View>
  );
}

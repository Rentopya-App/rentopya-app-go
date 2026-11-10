import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Platform, View } from 'react-native';

import { formErrors } from '@/core/api/form-errors';
import { Button } from '@/ui/button';
import { Icon } from '@/ui/icon';
import { Input } from '@/ui/input';
import { Select } from '@/ui/select';
import { Text } from '@/ui/text';

import { COUNTRY_CODES, countryName, type Errors } from './lib';

const NONE = '__none__';

/** Client errors (i18n keys) win over the API's field messages; the rest goes above the button. */
export function useFormErrors(local: Errors, error: unknown) {
  const { t } = useTranslation();
  const api = formErrors(error);
  const field = (name: string) => (local[name] ? t(local[name]) : api.fields[name]);
  return { field, message: api.message };
}

/** The form footer: the API's message, then the save button. */
export function Footer({ message, ...button }: { message?: string } & React.ComponentProps<typeof Button>) {
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

/**
 * A sensitive value: the plaintext while revealed, else the API's mask with
 * the "hidden" mark. Lists and details never get the plaintext otherwise.
 */
export function Masked({ masked, plain }: { masked: string | null | undefined; plain?: string | null }) {
  if (plain) {
    return (
      <Text variant="callout" className="font-sans-semibold tabular-nums" selectable>
        {plain}
      </Text>
    );
  }
  if (!masked) return <Text tone="muted">—</Text>;
  return (
    <View className="flex-row items-center gap-1">
      <Icon name="password" tone="muted-foreground" size={12} />
      <Text variant="callout" tone="muted" className="tabular-nums">
        {masked}
      </Text>
    </View>
  );
}

/** One label / value line of a detail card. */
export function Field({ label, children, last }: { label: string; children: ReactNode; last?: boolean }) {
  return (
    <View className={last ? 'gap-0.5 px-4 py-3' : 'gap-0.5 border-b border-border px-4 py-3'}>
      <Text variant="footnote" tone="muted">
        {label}
      </Text>
      {typeof children === 'string' ? <Text variant="callout">{children}</Text> : children}
    </View>
  );
}

/** A calendar day typed as GG.AA.YYYY: a birth date or a licence date is years back, too far for a month sheet. */
export function DayInput(props: Omit<React.ComponentProps<typeof Input>, 'keyboardType' | 'placeholder'>) {
  const { t } = useTranslation('customers_app');
  return (
    <Input
      keyboardType="numbers-and-punctuation"
      placeholder={t('day_placeholder')}
      maxLength={10}
      autoCorrect={false}
      hint={props.hint ?? t('day_hint')}
      {...props}
    />
  );
}

/** Nationality / country: the panel's list, searchable; `optional` adds an empty choice. */
export function CountrySelect({
  label,
  value,
  onChange,
  optional,
  error,
  hint,
}: {
  label: string;
  value: string;
  onChange: (code: string) => void;
  optional?: boolean;
  error?: string;
  hint?: string;
}) {
  const { t, i18n } = useTranslation('customers');
  const options = [
    ...(optional ? [{ value: NONE, label: '—' }] : []),
    ...COUNTRY_CODES.map((code) => ({ value: code as string, label: `${countryName(code, i18n.language)} (${code})` })),
  ];
  // A stored code outside the list stays choosable.
  if (value && !options.some((o) => o.value === value)) options.push({ value, label: value });
  return (
    <View className="gap-1">
      <Select
        label={label}
        value={value || (optional ? NONE : null)}
        placeholder={t('form.select_country')}
        searchable
        options={options}
        onChange={(v) => onChange(v === NONE ? '' : v)}
        error={error}
      />
      {hint && !error ? (
        <Text variant="footnote" tone="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/** Asks before a delete; the web preview runs it straight away (no native alert there). */
export function confirmDelete(
  title: string,
  body: string | undefined,
  labels: { cancel: string; ok: string },
  run: () => void,
) {
  if (Platform.OS === 'web') {
    run();
    return;
  }
  Alert.alert(title, body, [
    { text: labels.cancel, style: 'cancel' },
    { text: labels.ok, style: 'destructive', onPress: run },
  ]);
}

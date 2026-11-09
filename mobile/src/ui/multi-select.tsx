import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from './button';
import { cn } from './cn';
import { Icon } from './icon';
import type { IconName } from './icons';
import { SearchField } from './search-field';
import type { SelectOption } from './select';
import { Text } from './text';

/**
 * Several choices among many (branches, vehicle classes, roles): a row with
 * the picked names that opens a sheet of checkable rows. Changes apply when
 * the sheet is confirmed, so closing it keeps the previous picks.
 */
export function MultiSelect<T extends string>({
  label,
  values,
  options,
  onChange,
  placeholder,
  icon,
  error,
  hint,
  disabled,
}: {
  label: string;
  values: T[];
  options: SelectOption<T>[];
  onChange: (v: T[]) => void;
  placeholder?: string;
  icon?: IconName;
  error?: string;
  hint?: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<T[]>(values);
  const [q, setQ] = useState('');
  const picked = options.filter((o) => values.includes(o.value));
  const shown = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase();
    return needle ? options.filter((o) => o.label.toLocaleLowerCase().includes(needle)) : options;
  }, [options, q]);

  return (
    <View className="gap-1.5">
      <View className="flex-row items-center gap-1.5">
        {icon ? <Icon name={icon} tone="muted-foreground" size={14} weight="medium" /> : null}
        <Text variant="footnote" tone="muted" className="font-sans-medium">
          {label}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: picked.map((p) => p.label).join(', ') }}
        disabled={disabled}
        onPress={() => {
          setDraft(values);
          setQ('');
          setOpen(true);
        }}
        className={cn(
          'min-h-[52px] flex-row items-center gap-2 rounded-lg border bg-card px-4 py-3 active:opacity-80',
          error ? 'border-destructive' : 'border-border',
          disabled && 'opacity-50',
        )}>
        <Text className="flex-1" numberOfLines={3} tone={picked.length ? 'default' : 'muted'}>
          {picked.length ? picked.map((p) => p.label).join(', ') : (placeholder ?? '')}
        </Text>
        <Icon name="chevronDown" tone="muted-foreground" size={18} />
      </Pressable>
      {error ? (
        <Text variant="footnote" tone="danger">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="footnote" tone="muted">
          {hint}
        </Text>
      ) : null}

      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <View className="flex-1 bg-background" style={{ paddingBottom: insets.bottom + 12 }}>
          <View className="flex-row items-center gap-3 border-b border-border px-4 py-3">
            <Text variant="headline" className="flex-1" numberOfLines={1}>
              {label}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel={t('close')} onPress={() => setOpen(false)}>
              <Icon name="close" tone="muted-foreground" size={22} />
            </Pressable>
          </View>
          {options.length > 8 ? (
            <View className="px-4 pt-3">
              <SearchField value={q} onChangeText={setQ} placeholder={t('search')} />
            </View>
          ) : null}
          <FlatList
            data={shown}
            keyExtractor={(o) => o.value}
            keyboardShouldPersistTaps="handled"
            contentContainerClassName="px-4 py-3"
            ListEmptyComponent={
              <Text tone="muted" className="py-8 text-center">
                {t('no_results')}
              </Text>
            }
            renderItem={({ item, index }) => {
              const on = draft.includes(item.value);
              return (
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  onPress={() => setDraft((d) => (on ? d.filter((v) => v !== item.value) : [...d, item.value]))}
                  className={cn(
                    'min-h-12 flex-row items-center gap-3 border-x border-border bg-card px-4 py-3 active:bg-muted',
                    index === 0 && 'rounded-t-lg border-t',
                    index === shown.length - 1 ? 'rounded-b-lg border-b' : 'border-b',
                  )}>
                  <View
                    className={cn(
                      'size-6 items-center justify-center rounded-md border',
                      on ? 'border-primary bg-primary' : 'border-border',
                    )}>
                    {on ? <Icon name="check" tone="primary-foreground" size={16} /> : null}
                  </View>
                  <View className="flex-1 gap-0.5">
                    <Text>{item.label}</Text>
                    {item.description ? (
                      <Text variant="footnote" tone="muted">
                        {item.description}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            }}
          />
          <View className="px-4">
            <Button
              title={t('done')}
              size="lg"
              onPress={() => {
                onChange(options.map((o) => o.value).filter((v) => draft.includes(v)));
                setOpen(false);
              }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

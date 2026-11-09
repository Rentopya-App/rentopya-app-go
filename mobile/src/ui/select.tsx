import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cn } from './cn';
import { Icon } from './icon';
import type { IconName } from './icons';
import { SearchField } from './search-field';
import { Text } from './text';

export type SelectOption<T extends string = string> = { value: T; label: string; description?: string };

/**
 * A choice among many, never a native picker: a row that shows the current
 * value and opens a sheet with a searchable list. For two to five short
 * options prefer `Chips`.
 */
export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  placeholder,
  icon,
  error,
  searchable,
  disabled,
  footer,
}: {
  label: string;
  value: T | null | undefined;
  options: SelectOption<T>[];
  onChange: (v: T) => void;
  placeholder?: string;
  icon?: IconName;
  error?: string;
  searchable?: boolean;
  disabled?: boolean;
  /** Extra row at the end of the sheet (e.g. "new customer"). */
  footer?: { label: string; onPress: () => void };
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
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
        accessibilityValue={{ text: current?.label }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        className={cn(
          'min-h-[52px] flex-row items-center gap-2 rounded-lg border bg-card px-4 active:opacity-80',
          error ? 'border-destructive' : 'border-border',
          disabled && 'opacity-50',
        )}>
        <View className="flex-1">
          <Text numberOfLines={1} tone={current ? 'default' : 'muted'}>
            {current?.label ?? placeholder ?? ''}
          </Text>
          {current?.description ? (
            <Text variant="footnote" tone="muted" numberOfLines={1}>
              {current.description}
            </Text>
          ) : null}
        </View>
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
        options={options}
        value={value}
        searchable={searchable ?? options.length > 8}
        footer={footer ? { ...footer, onPress: () => (setOpen(false), footer.onPress()) } : undefined}
        onClose={() => setOpen(false)}
        onPick={(v) => {
          setOpen(false);
          onChange(v);
        }}
      />
    </View>
  );
}

/** The sheet behind `Select`; also usable on its own (search-as-you-type lists pass `onSearch`). */
export function OptionSheet<T extends string>({
  visible,
  title,
  options,
  value,
  searchable,
  onSearch,
  loading,
  footer,
  onClose,
  onPick,
}: {
  visible: boolean;
  title: string;
  options: SelectOption<T>[];
  value?: T | null;
  searchable?: boolean;
  /** Server-side search: the sheet shows `options` as given and reports the text. */
  onSearch?: (q: string) => void;
  loading?: boolean;
  footer?: { label: string; onPress: () => void };
  onClose: () => void;
  onPick: (v: T) => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    if (onSearch || !q.trim()) return options;
    const needle = q.trim().toLocaleLowerCase();
    return options.filter((o) => `${o.label} ${o.description ?? ''}`.toLocaleLowerCase().includes(needle));
  }, [options, q, onSearch]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View className="flex-1 bg-background" style={{ paddingBottom: insets.bottom }}>
        <View className="flex-row items-center gap-3 border-b border-border px-4 py-3">
          <Text variant="headline" className="flex-1" numberOfLines={1}>
            {title}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel={t('close')} onPress={onClose} hitSlop={10}>
            <Icon name="close" tone="muted-foreground" size={22} />
          </Pressable>
        </View>
        {searchable || onSearch ? (
          <View className="px-4 pt-3">
            <SearchField
              value={q}
              onChangeText={(v) => {
                setQ(v);
                onSearch?.(v);
              }}
              placeholder={t('search')}
            />
          </View>
        ) : null}
        <FlatList
          data={shown}
          keyExtractor={(o) => o.value}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerClassName="px-4 py-3"
          ListEmptyComponent={
            <Text tone="muted" className="py-8 text-center">
              {loading ? t('loading') : t('no_results')}
            </Text>
          }
          renderItem={({ item, index }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: item.value === value }}
              onPress={() => onPick(item.value)}
              className={cn(
                'min-h-12 flex-row items-center gap-3 border-x border-border bg-card px-4 py-3 active:bg-muted',
                index === 0 && 'rounded-t-lg border-t',
                index === shown.length - 1 ? 'rounded-b-lg border-b' : 'border-b',
              )}>
              <View className="flex-1 gap-0.5">
                <Text>{item.label}</Text>
                {item.description ? (
                  <Text variant="footnote" tone="muted">
                    {item.description}
                  </Text>
                ) : null}
              </View>
              {item.value === value ? <Icon name="check" tone="primary" size={18} /> : null}
            </Pressable>
          )}
          ListFooterComponent={
            footer ? (
              <Pressable
                accessibilityRole="button"
                onPress={footer.onPress}
                className="mt-3 min-h-12 flex-row items-center gap-3 rounded-lg border border-dashed border-border px-4 active:bg-muted">
                <Icon name="add" tone="primary" size={18} />
                <Text tone="primary" className="font-sans-semibold">
                  {footer.label}
                </Text>
              </Pressable>
            ) : undefined
          }
        />
      </View>
    </Modal>
  );
}

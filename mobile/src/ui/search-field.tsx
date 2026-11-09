import { TextInput, View } from 'react-native';

import { Icon } from './icon';

/** Rounded search box at the top of a list. */
export function SearchField({
  value,
  onChangeText,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  autoFocus?: boolean;
}) {
  return (
    <View className="min-h-11 flex-row items-center gap-2 rounded-lg bg-secondary px-3">
      <Icon name="search" tone="muted-foreground" size={17} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        accessibilityLabel={placeholder}
        placeholderTextColorClassName="accent-muted-foreground"
        className="flex-1 py-2 font-sans text-[17px] text-foreground"
        autoCorrect={false}
        clearButtonMode="while-editing"
        returnKeyType="search"
        autoFocus={autoFocus}
      />
    </View>
  );
}

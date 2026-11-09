import * as AppleAuthentication from 'expo-apple-authentication';
import { ActivityIndicator, View } from 'react-native';
import { useUniwind } from 'uniwind';

/**
 * Apple's own button (Human Interface Guidelines: system drawn, localized
 * by iOS), black on light and white on dark, as tall as the `lg` buttons.
 */
export function AppleButton({ onPress, loading }: { onPress: () => void; loading?: boolean }) {
  const { theme } = useUniwind();
  return (
    <View className={loading ? 'opacity-60' : undefined} pointerEvents={loading ? 'none' : 'auto'}>
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
        buttonStyle={
          theme === 'dark'
            ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
            : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
        }
        cornerRadius={16}
        style={{ height: 52, width: '100%' }}
        onPress={onPress}
      />
      {loading ? (
        <View className="absolute inset-0 items-center justify-center">
          <ActivityIndicator colorClassName="accent-muted-foreground" />
        </View>
      ) : null}
    </View>
  );
}

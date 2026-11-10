import { Alert, Platform } from 'react-native';

import { i18n } from '@/core/i18n';

/** Native confirmation (the panel's confirm dialog); resolves true on the action button. */
export function confirmAction(opts: { title: string; body?: string; action: string; destructive?: boolean }) {
  if (Platform.OS === 'web') {
    const ok = typeof globalThis.confirm === 'function' ? globalThis.confirm(opts.body ?? opts.title) : true;
    return Promise.resolve(ok);
  }
  return new Promise<boolean>((resolve) => {
    Alert.alert(
      opts.title,
      opts.body,
      [
        { text: i18n.t('common:cancel'), style: 'cancel', onPress: () => resolve(false) },
        { text: opts.action, style: opts.destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { type Tokens, tokensFromApi } from '@/core/api/auth-fetch';

export type { Tokens };
export { tokensFromApi as fromApi };

/**
 * The token pair lives in the Keychain / Keystore (expo-secure-store), never
 * in AsyncStorage or sqlite. Kept in memory after the first read so every
 * request reads it synchronously.
 */
const KEY = 'rentopya.auth.tokens';
let current: Tokens | null = null;
const listeners = new Set<(t: Tokens | null) => void>();

export function getTokens() {
  return current;
}

/** Reads the stored pair once at launch (before the splash hides). */
export async function loadTokens(): Promise<Tokens | null> {
  if (Platform.OS === 'web') return current;
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    current = raw ? (JSON.parse(raw) as Tokens) : null;
  } catch {
    current = null;
  }
  return current;
}

export async function setTokens(t: Tokens) {
  current = t;
  listeners.forEach((fn) => fn(t));
  // The web preview has no secure store: the pair then lives in memory for the tab only.
  if (Platform.OS === 'web') return;
  // Only this device: the pair is not restored from a backup onto another phone.
  await SecureStore.setItemAsync(KEY, JSON.stringify(t), {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
}

export async function clearTokens() {
  current = null;
  listeners.forEach((fn) => fn(null));
  if (Platform.OS === 'web') return;
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    // Nothing stored (or no secure store in the web preview).
  }
}

export function onTokensChange(fn: (t: Tokens | null) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

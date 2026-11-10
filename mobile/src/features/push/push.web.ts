import { create } from 'zustand';

/**
 * Web preview: no Expo push (expo-notifications has no web support for
 * Expo tokens). Same API as `push.ts`, every call a no-op.
 */
export type PushPermission = 'granted' | 'denied' | 'undetermined' | 'unavailable';

export const usePushPermission = create<{ status: PushPermission; set: (s: PushPermission) => void }>((set) => ({
  status: 'unavailable',
  set: (status) => set({ status }),
}));

export const ANDROID_CHANNEL = 'default';

export async function refreshPermission(_ask: boolean): Promise<PushPermission> {
  return 'unavailable';
}

export async function registerPush(_opts: { ask: boolean } = { ask: true }): Promise<void> {}

export async function unregisterPush(): Promise<void> {}

export function watchTokenChanges(): () => void {
  return () => {};
}

export function setBadge(_count: number) {}

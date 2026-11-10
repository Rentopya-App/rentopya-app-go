import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';
import { create } from 'zustand';

import { api, unwrap } from '@/core/api/client';
import { APP_VERSION, PLATFORM } from '@/core/config';
import { i18n } from '@/core/i18n';
import { storage } from '@/core/storage';

/**
 * Push notifications (Expo push service). The member's in-app
 * notifications are mirrored to every phone registered with
 * `POST /v1/push-devices` (user-level, lock-screen-safe texts, `data.url`
 * = the panel path). The permission is asked once a company is picked,
 * never at launch; sign-out removes the device first.
 */

// Shown while the app is open as well (the push is about something new).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export type PushPermission = 'granted' | 'denied' | 'undetermined' | 'unavailable';

/** The OS permission as the menu row shows it. */
export const usePushPermission = create<{ status: PushPermission; set: (s: PushPermission) => void }>((set) => ({
  status: 'undetermined',
  set: (status) => set({ status }),
}));

/** Android channel every push lands in (`defaultChannel` of the config plugin). */
export const ANDROID_CHANNEL = 'default';

/** Token registered on the API for this phone (kept for sign-out after a restart). */
const TOKEN_KEY = 'push.token';

/** EAS project id; `eas init` writes it to app.json `extra.eas.projectId` (empty until then). */
function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId || Constants.easConfig?.projectId || undefined;
}

let warned = false;

/** Pushes need a real phone and an EAS project; web, simulators and builds before `eas init` have none. */
function unavailableReason(): string | null {
  if (Platform.OS === 'web') return 'web';
  if (!Device.isDevice) return 'not a physical device';
  if (!projectId()) return 'no EAS projectId (run `eas init`)';
  return null;
}

/** Reads (and with `ask`, requests) the permission; Android gets its channel first. */
export async function refreshPermission(ask: boolean): Promise<PushPermission> {
  let status: PushPermission;
  const reason = unavailableReason();
  if (reason) {
    if (!warned) {
      warned = true;
      console.info(`[push] disabled: ${reason}`);
    }
    status = 'unavailable';
  } else {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
        name: i18n.t('push:channel_name'),
        importance: AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#2E358C',
      });
    }
    let p = await Notifications.getPermissionsAsync();
    if (ask && p.status === 'undetermined' && p.canAskAgain) p = await Notifications.requestPermissionsAsync();
    status = p.granted ? 'granted' : p.status === 'denied' ? 'denied' : 'undetermined';
  }
  usePushPermission.getState().set(status);
  return status;
}

let registering: Promise<void> | null = null;

/**
 * Registers this phone for the signed-in member: asks for the permission
 * (once), reads the Expo token and upserts it. Best effort: without a
 * network the next start tries again. A token that changed replaces the
 * previous one.
 */
export function registerPush(opts: { ask: boolean } = { ask: true }): Promise<void> {
  registering ??= (async () => {
    try {
      if ((await refreshPermission(opts.ask)) !== 'granted') return;
      const token = (await Notifications.getExpoPushTokenAsync({ projectId: projectId() })).data;
      await sendToken(token);
    } catch (e) {
      console.info('[push] registration skipped', e instanceof Error ? e.message : e);
    } finally {
      registering = null;
    }
  })();
  return registering;
}

async function sendToken(token: string) {
  const previous = storage.getString(TOKEN_KEY);
  await unwrap(
    api.POST('/v1/push-devices', {
      body: {
        token,
        platform: PLATFORM,
        locale: i18n.language,
        app_version: APP_VERSION.slice(0, 32),
        device_name: (Device.deviceName ?? Device.modelName ?? '').slice(0, 120),
      },
    }),
  );
  storage.set(TOKEN_KEY, token);
  if (previous && previous !== token) await deleteToken(previous);
}

function deleteToken(token: string) {
  // openapi-fetch URL-encodes the path parameter (`ExponentPushToken%5B...%5D`).
  return unwrap(api.DELETE('/v1/push-devices/{token}', { params: { path: { token } } })).catch(() => undefined);
}

/**
 * Before a sign-out or an account deletion, while the access token still
 * works: this phone stops getting the member's pushes. Never throws.
 */
export async function unregisterPush() {
  const token = storage.getString(TOKEN_KEY);
  storage.remove(TOKEN_KEY);
  if (Platform.OS !== 'web') await Notifications.setBadgeCountAsync(0).catch(() => false);
  if (token) await deleteToken(token);
}

/** The OS rotated the device token: register the new Expo token. Returns the unsubscribe. */
export function watchTokenChanges(): () => void {
  if (unavailableReason()) return () => {};
  const sub = Notifications.addPushTokenListener(() => {
    void registerPush({ ask: false });
  });
  return () => sub.remove();
}

/** App icon badge (iOS, some Android launchers). */
export function setBadge(count: number) {
  if (unavailableReason()) return;
  void Notifications.setBadgeCountAsync(Math.max(0, count)).catch(() => false);
}

import * as AppIntents from 'expo-app-intents';
import { type Href, router, useRootNavigationState } from 'expo-router';
import { Platform } from 'react-native';

import { Permission, useCan } from '@/core/auth/permissions';
import { useSession } from '@/core/auth/session';
import { findByPlate } from '@/features/vehicles/api';

import { intentTarget, plateListHref } from './routes';

function available() {
  if (Platform.OS !== 'ios') return false;
  try {
    return AppIntents.isAvailable();
  } catch {
    return false;
  }
}

/**
 * Opens what a Siri / Shortcuts action asked for
 * (`app-intents/Intents/OpenIntents.swift`). Actions queue natively until this
 * consumer runs, so one taken while the app was closed opens once navigation
 * is ready. Rendered once in the root shell; a no-op on Android and web.
 */
export function AppIntentsHandler() {
  const ready = !!useRootNavigationState()?.key;
  if (!ready || !available()) return null;
  return <Consumer />;
}

function Consumer() {
  const can = useCan();
  const vehicles = can(Permission.TenantVehiclesRead);
  AppIntents.useAppIntents(async (pending) => {
    const s = useSession.getState();
    const access = { signedIn: s.status === 'signedIn' && !!s.organization, vehicles };
    // Several queued actions (the app was closed): only the newest one opens.
    let target: ReturnType<typeof intentTarget> = null;
    for (const invocation of pending) {
      try {
        const next = intentTarget(invocation.name, invocation.params, access);
        await AppIntents.removePendingInvocationAsync(invocation.id);
        if (next) target = next;
      } catch (error) {
        if (__DEV__) console.warn('App Intent stays pending', invocation.id, error);
      }
    }
    if (!target) return;
    if (target.kind === 'route') {
      router.navigate(target.href as Href);
      return;
    }
    // Same rule as the scanner: one hit opens the vehicle, else the list searched by the plate.
    try {
      const page = await findByPlate(target.plate);
      if (page.total === 1 && page.items[0]) router.navigate(`/vehicle/${page.items[0].uuid}`);
      else router.navigate(plateListHref(target.plate) as Href);
    } catch {
      router.navigate(plateListHref(target.plate) as Href);
    }
  });
  return null;
}

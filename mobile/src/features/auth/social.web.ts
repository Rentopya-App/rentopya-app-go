/**
 * Web preview: no native Apple / Google sheets; e-mail and password only.
 * Same exports as `social.ts`.
 */
import type { NativeCredential } from './oauth';

export function googleConfigured() {
  return false;
}

export function useSocialProviders() {
  return { apple: false, google: false };
}

export async function requestAppleCredential(): Promise<NativeCredential | null> {
  throw new Error('APPLE_UNAVAILABLE');
}

export async function requestGoogleCredential(): Promise<NativeCredential | null> {
  throw new Error('GOOGLE_UNAVAILABLE');
}

export async function signOutGoogle() {}

/**
 * Native Sign in with Apple (`expo-apple-authentication`, iOS) and Google
 * (`react-native-nitro-google-signin`: Credential Manager on Android, the
 * Google Sign-In SDK on iOS). Each is off unless configured
 * (`core/config.ts`); the native modules load lazily, so a binary built
 * without them (or Expo Go) reports the provider as unavailable instead of
 * crashing.
 *
 * Nonce: a random raw nonce per attempt; its SHA-256 goes to the SDK (so it
 * ends up in the id token) and the raw value to the API, which accepts either.
 */
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { APPLE_SIGN_IN, GOOGLE_IOS_CLIENT_ID, GOOGLE_WEB_CLIENT_ID } from '@/core/config';

import type { NativeCredential } from './oauth';

type AppleModule = typeof import('expo-apple-authentication');
type GoogleModule = typeof import('react-native-nitro-google-signin');
type CryptoModule = typeof import('expo-crypto');

function safeLoad<T>(load: () => T): T | null {
  try {
    return load();
  } catch {
    return null;
  }
}

let apple: AppleModule | null | undefined;
let google: GoogleModule | null | undefined;
let crypto: CryptoModule | null | undefined;

/* eslint-disable @typescript-eslint/no-require-imports */
function appleModule(): AppleModule | null {
  if (Platform.OS !== 'ios' || !APPLE_SIGN_IN) return null;
  apple ??= safeLoad(() => require('expo-apple-authentication') as AppleModule);
  return apple;
}

function googleModule(): GoogleModule | null {
  if (!googleConfigured()) return null;
  google ??= safeLoad(() => require('react-native-nitro-google-signin') as GoogleModule);
  return google;
}

function cryptoModule(): CryptoModule | null {
  crypto ??= safeLoad(() => require('expo-crypto') as CryptoModule);
  return crypto;
}
/* eslint-enable @typescript-eslint/no-require-imports */

/** Google needs the web client id everywhere and the iOS client id on iOS. */
export function googleConfigured() {
  if (!GOOGLE_WEB_CLIENT_ID) return false;
  return Platform.OS === 'android' || (Platform.OS === 'ios' && !!GOOGLE_IOS_CLIENT_ID);
}

async function appleAvailable() {
  const mod = appleModule();
  if (!mod) return false;
  try {
    return await mod.isAvailableAsync();
  } catch {
    return false;
  }
}

/** Which native sign-in buttons to show. */
export function useSocialProviders() {
  const [state, setState] = useState({ apple: false, google: false });
  useEffect(() => {
    let alive = true;
    void appleAvailable().then((a) => alive && setState({ apple: a, google: googleModule() !== null }));
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

async function createNonce() {
  const c = cryptoModule();
  if (!c) throw new Error('expo-crypto unavailable');
  const raw = Array.from(c.getRandomBytes(32), (b) => b.toString(16).padStart(2, '0')).join('');
  const hashed = await c.digestStringAsync(c.CryptoDigestAlgorithm.SHA256, raw);
  return { raw, hashed };
}

const isCancel = (e: unknown) => {
  const code = (e as { code?: string })?.code;
  return code === 'ERR_REQUEST_CANCELED' || code === 'ERR_CANCELED' || code === 'SIGN_IN_CANCELLED';
};

/** Opens the Apple sheet. Resolves to null when the person closes it. */
export async function requestAppleCredential(): Promise<NativeCredential | null> {
  const mod = appleModule();
  if (!mod) throw new Error('APPLE_UNAVAILABLE');
  const nonce = await createNonce();
  try {
    const c = await mod.signInAsync({
      requestedScopes: [mod.AppleAuthenticationScope.FULL_NAME, mod.AppleAuthenticationScope.EMAIL],
      nonce: nonce.hashed,
    });
    if (!c.identityToken) return null;
    return {
      id_token: c.identityToken,
      nonce: nonce.raw,
      // Apple sends the name only on the first sign-in, never in the token.
      given_name: c.fullName?.givenName ?? undefined,
      family_name: c.fullName?.familyName ?? undefined,
      // Exchanged for a refresh token the API revokes on account deletion.
      authorization_code: c.authorizationCode ?? undefined,
    };
  } catch (e) {
    if (isCancel(e)) return null;
    throw e;
  }
}

/** Opens the Google sheet. Resolves to null when the person closes it. */
export async function requestGoogleCredential(): Promise<NativeCredential | null> {
  const mod = googleModule();
  if (!mod) throw new Error('GOOGLE_UNAVAILABLE');
  const { GoogleOneTapSignIn, isCancelledResponse, isNoSavedCredentialFoundResponse, isSuccessResponse } = mod;
  const nonce = await createNonce();
  try {
    GoogleOneTapSignIn.configure({
      webClientId: GOOGLE_WEB_CLIENT_ID!,
      iosClientId: GOOGLE_IOS_CLIENT_ID,
      nonce: nonce.hashed,
    });
    if (Platform.OS === 'android') await GoogleOneTapSignIn.checkPlayServices();
    // iOS signIn() would return the cached session's id token, which carries an earlier nonce.
    let response =
      Platform.OS === 'ios' ? await GoogleOneTapSignIn.presentExplicitSignIn() : await GoogleOneTapSignIn.signIn();
    if (isNoSavedCredentialFoundResponse(response)) response = await GoogleOneTapSignIn.createAccount();
    if (isNoSavedCredentialFoundResponse(response)) response = await GoogleOneTapSignIn.presentExplicitSignIn();
    if (isCancelledResponse(response)) return null;
    if (!isSuccessResponse(response) || !response.data.idToken) return null;
    return {
      id_token: response.data.idToken,
      nonce: nonce.raw,
      given_name: response.data.user.givenName ?? undefined,
      family_name: response.data.user.familyName ?? undefined,
    };
  } catch (e) {
    if (isCancel(e)) return null;
    throw e;
  }
}

/** Forgets the Google account choice so the next attempt shows the picker again. */
export async function signOutGoogle() {
  const mod = googleModule();
  if (!mod) return;
  try {
    await mod.GoogleOneTapSignIn.signOut();
  } catch {
    // Nothing to forget.
  }
}

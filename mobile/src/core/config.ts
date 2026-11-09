import * as Application from 'expo-application';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Origin of the Go API: the app calls `<API_URL>/v1/*` with its own Bearer
 * token pair (no Next.js passthrough). Locally `http://localhost:8080` on a
 * simulator, `http://<LAN IP>:8080` on a device.
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8080').replace(/\/$/, '');

/** Panel origin, for links that open the web (forgot password, settings). */
export const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL ?? 'http://localhost:3000').replace(/\/$/, '');

/**
 * Native sign-in switches. Sign in with Apple needs the capability on the App
 * ID and the bundle id in the API's `AUTH_APPLE_NATIVE_CLIENT_IDS`; Google
 * needs OAuth client ids (web always, iOS on iOS) that the API also lists in
 * `AUTH_GOOGLE_NATIVE_CLIENT_IDS`. Unset = the button is not shown.
 */
export const APPLE_SIGN_IN = process.env.EXPO_PUBLIC_APPLE_SIGN_IN === '1';
export const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() || undefined;
export const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() || undefined;

/**
 * App release (`X-App-Version`). In Expo Go the native version is Expo Go's
 * own, so the app.json version is used there.
 */
export const APP_VERSION =
  (Constants.executionEnvironment === ExecutionEnvironment.StoreClient ? Constants.expoConfig?.version : undefined) ??
  Application.nativeApplicationVersion ??
  '0.0.0';

export const PLATFORM = Platform.OS === 'android' ? 'android' : 'ios';

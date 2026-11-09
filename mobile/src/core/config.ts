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
 * App release (`X-App-Version`). In Expo Go the native version is Expo Go's
 * own, so the app.json version is used there.
 */
export const APP_VERSION =
  (Constants.executionEnvironment === ExecutionEnvironment.StoreClient ? Constants.expoConfig?.version : undefined) ??
  Application.nativeApplicationVersion ??
  '0.0.0';

export const PLATFORM = Platform.OS === 'android' ? 'android' : 'ios';

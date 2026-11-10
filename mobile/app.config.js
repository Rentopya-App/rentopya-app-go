// Dynamic additions to app.json (Expo passes the static config in as `config`).
//
// Native sign-in is switched on per build environment (.env.local / EAS env):
// - EXPO_PUBLIC_APPLE_SIGN_IN=1 adds the Sign in with Apple entitlement (the
//   App ID needs the capability; the API lists the bundle id in
//   AUTH_APPLE_NATIVE_CLIENT_IDS).
// - EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID adds Google's config plugin with the
//   reversed iOS client id as a URL scheme (the plugin refuses to run without
//   one). Android needs no plugin, only EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID at runtime.
//
// OTA: the update channel is EXPO_UPDATES_CHANNEL, else derived from
// EXPO_PUBLIC_APP_ENV, and written as the `expo-channel-name` request header,
// because Xcode Cloud builds are not EAS builds and get no channel from eas.json.
// Store values (production) live in release.env, shared with the release job
// and Xcode Cloud (docs/OTA.md).
const GOOGLE_PLUGIN = 'react-native-nitro-google-signin';

function updatesChannel() {
  const explicit = process.env.EXPO_UPDATES_CHANNEL?.trim();
  if (explicit) return explicit;
  switch (process.env.EXPO_PUBLIC_APP_ENV) {
    case 'production':
      return 'production';
    case 'preview':
      return 'preview';
    default:
      return 'development';
  }
}

// Store builds (EXPO_PUBLIC_APP_ENV=production) must talk to the live API over
// https. This stops a misconfigured Xcode Cloud / EAS workflow before it builds.
function assertStoreConfig() {
  if (process.env.EXPO_PUBLIC_APP_ENV !== 'production') return;
  const problems = [];
  const mode = process.env.EXPO_PUBLIC_API_MODE;
  if (mode && mode !== 'live') problems.push('EXPO_PUBLIC_API_MODE must be "live"');
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  if (apiUrl && !/^https:\/\//i.test(apiUrl)) problems.push('EXPO_PUBLIC_API_URL must be an https:// URL');
  if (problems.length) {
    throw new Error(`Store build (EXPO_PUBLIC_APP_ENV=production) misconfigured: ${problems.join('; ')}`);
  }
}

function googleIosUrlScheme() {
  const clientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();
  if (!clientId) return null;
  return `com.googleusercontent.apps.${clientId.replace(/\.apps\.googleusercontent\.com$/, '')}`;
}

module.exports = ({ config }) => {
  assertStoreConfig();
  const channel = updatesChannel();
  const projectId = config.extra?.eas?.projectId;
  const iosUrlScheme = googleIosUrlScheme();
  const plugins = (config.plugins ?? []).filter(
    (p) => p !== GOOGLE_PLUGIN && !(Array.isArray(p) && p[0] === GOOGLE_PLUGIN),
  );
  if (iosUrlScheme) plugins.push([GOOGLE_PLUGIN, { iosUrlScheme }]);

  return {
    ...config,
    ios: {
      ...config.ios,
      ...(process.env.EXPO_PUBLIC_APPLE_SIGN_IN === '1' ? { usesAppleSignIn: true } : {}),
    },
    updates: {
      ...config.updates,
      ...(projectId && !config.updates?.url ? { url: `https://u.expo.dev/${projectId}` } : {}),
      requestHeaders: {
        ...config.updates?.requestHeaders,
        'expo-channel-name': channel,
      },
    },
    plugins,
  };
};

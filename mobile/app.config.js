// Dynamic additions to app.json (Expo passes the static config in as `config`).
//
// Native sign-in is switched on per build environment (.env.local / EAS env):
// - EXPO_PUBLIC_APPLE_SIGN_IN=1 adds the Sign in with Apple entitlement (the
//   App ID needs the capability; the API lists the bundle id in
//   AUTH_APPLE_NATIVE_CLIENT_IDS).
// - EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID adds Google's config plugin with the
//   reversed iOS client id as a URL scheme (the plugin refuses to run without
//   one). Android needs no plugin, only EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID at runtime.
const GOOGLE_PLUGIN = 'react-native-nitro-google-signin';

function googleIosUrlScheme() {
  const clientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();
  if (!clientId) return null;
  return `com.googleusercontent.apps.${clientId.replace(/\.apps\.googleusercontent\.com$/, '')}`;
}

module.exports = ({ config }) => {
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
    plugins,
  };
};

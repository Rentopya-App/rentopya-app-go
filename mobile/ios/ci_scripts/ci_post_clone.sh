#!/bin/sh
# Xcode Cloud: runs right after the repo is cloned, before xcodebuild.
# mobile/ios/ is not committed (Expo CNG), so this regenerates the native
# project and installs pods. Source of truth: mobile/scripts/xcode-cloud/
# (copied into mobile/ios/ci_scripts by plugins/with-xcode-cloud.js on every
# prebuild; scripts/ci/mobile-release.test.sh checks the copies match).
#
# Release values (EXPO_PUBLIC_APP_ENV, EXPO_PUBLIC_API_MODE, native sign-in
# switches) come from mobile/release.env, the same file the GitHub release job
# and the EAS check read, so the iOS fingerprint is the one the ios-build-* tag
# was named after. The Xcode Cloud workflow only adds EXPO_PUBLIC_API_URL,
# EXPO_PUBLIC_WEB_URL and EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID (mobile/docs/OTA.md).
set -eu

echo "==> ci_post_clone: starting"
cd "$CI_PRIMARY_REPOSITORY_PATH/mobile"

# Apple sets CI=TRUE; some JS tools expect a real boolean.
export CI=true
export HOMEBREW_NO_AUTO_UPDATE=1
export HOMEBREW_NO_INSTALL_CLEANUP=1
export HOMEBREW_NO_ENV_HINTS=1

# Release values. A workflow variable that disagrees with release.env would
# build a binary that OTA updates never reach: stop instead.
exports=""
while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in '' | '#'*) continue ;; esac
  key="${line%%=*}"
  value="${line#*=}"
  current="$(printenv "$key" || true)"
  if [ -n "$current" ] && [ "$current" != "$value" ]; then
    echo "error: Xcode Cloud sets $key=$current but mobile/release.env says '$value'" >&2
    exit 1
  fi
  export "$key=$value"
  exports="${exports}export $key='$value'
"
done <release.env
for key in EXPO_PUBLIC_API_URL EXPO_PUBLIC_WEB_URL EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID; do
  value="$(printenv "$key" || true)"
  [ -n "$value" ] && exports="${exports}export $key='$value'
"
done
case "${EXPO_PUBLIC_API_URL:-}" in
  https://*) ;;
  *) echo "error: set EXPO_PUBLIC_API_URL=https://<api host> in the Xcode Cloud workflow" >&2; exit 1 ;;
esac

# Node 22 (same major as frontend/.nvmrc, which the GitHub release job uses).
brew install node@22 cocoapods || brew install node cocoapods
brew link --overwrite --force node@22 2>/dev/null || true
echo "==> node $(node -v) / npm $(npm -v) / pod $(pod --version)"

npm ci --no-audit --no-fund

# Compared with the fingerprint the GitHub release job named the tag after.
hash="$(npx expo-updates fingerprint:generate --platform ios | node -e 'let s="";process.stdin.on("data",(d)=>(s+=d)).on("end",()=>console.log(JSON.parse(s).hash))')"
echo "==> ios fingerprint: $hash"
case "${CI_TAG:-}" in
  ios-build-*)
    want="$(echo "$CI_TAG" | sed -E 's/^ios-build-([0-9a-f]{12}).*/\1/')"
    if [ "$want" != "$(echo "$hash" | cut -c1-12)" ]; then
      echo "error: tag $CI_TAG was cut for fingerprint $want, this build has $hash." >&2
      echo "       The Xcode Cloud environment differs from mobile/release.env / EAS production; OTA updates would never reach this binary." >&2
      exit 1
    fi
    ;;
esac

npx expo prebuild --platform ios --clean --no-install

# React Native build phases source ios/.xcode.env.local: an explicit Node path,
# and the release values for the JS bundle (EXPO_PUBLIC_* are inlined then).
{
  echo "export NODE_BINARY=$(command -v node)"
  printf '%s' "$exports"
} >ios/.xcode.env.local

cd ios
pod install

echo "==> ci_post_clone: done"
ls -d ./*.xcworkspace

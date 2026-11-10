#!/usr/bin/env bash
# Tests for scripts/ci/mobile-release.sh with a fake eas CLI, a fake
# fingerprint tool and a local bare git repository as the tag remote. Nothing
# here talks to EAS, Expo or GitHub. Also checks that the Xcode Cloud scripts
# committed under mobile/ios/ci_scripts match their source.
#
# Usage (repo root): scripts/ci/mobile-release.test.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="$ROOT/scripts/ci/mobile-release.sh"
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
# Throwaway repositories: ignore the user's git config (signing, push hooks).
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
pass=0
failures=0

ok() {
  pass=$((pass + 1))
  echo "ok   $1"
}
bad() {
  failures=$((failures + 1))
  echo "FAIL $1"
  [ -n "${2:-}" ] && sed 's/^/     | /' <<<"$2"
  return 0
}

# --- fakes -------------------------------------------------------------------
mkdir -p "$T/bin"
cat >"$T/bin/eas" <<'EOF'
#!/usr/bin/env bash
# Fake eas: answers read-only commands from MOCK_* env, records every call.
echo "$*" >>"$EAS_LOG"
case "$1" in
  env:list) printf '%s\n' "$MOCK_ENV_LIST" ;;
  build:list)
    [ "${MOCK_BUILD_LIST_FAIL:-}" = "1" ] && { echo "boom" >&2; exit 1; }
    echo "Some banner line"
    printf '%s\n' "${MOCK_BUILD_LIST:-[]}" ;;
  fingerprint:compare)
    printf '{"fingerprint1":{"hash":"%s"},"fingerprint2":{"hash":"%s"}}\n' "$MOCK_REMOTE_FP" "$MOCK_LOCAL_FP" ;;
  update | build) echo "published" ;;
  *) echo "unexpected eas $*" >&2; exit 2 ;;
esac
EOF
cat >"$T/bin/fingerprint" <<'EOF'
#!/usr/bin/env bash
# Fake `expo-updates fingerprint:generate`: the hash depends on the env the
# release script exported, so a missing release.env value changes it.
[ "$1" = "--platform" ] || exit 2
echo "{\"hash\":\"${MOCK_IOS_FP}\",\"platform\":\"$2\",\"appEnv\":\"${EXPO_PUBLIC_APP_ENV:-}\"}"
EOF
chmod +x "$T/bin/eas" "$T/bin/fingerprint"

# A complete EAS production env: every non-empty release.env value plus the
# URLs that live only in EAS.
GOOD_ENV="$(grep -E '^[A-Z0-9_]+=.+' "$ROOT/mobile/release.env")
EXPO_PUBLIC_API_URL=https://api.rentopya.example
EXPO_PUBLIC_WEB_URL=https://panel.rentopya.example"

# A fresh repo (mobile/ with the real release.env and an app.json with a
# project id) and an empty bare remote for each scenario.
setup() {
  rm -rf "$T/repo" "$T/origin.git" "$T/eas.log"
  git init -q --bare "$T/origin.git"
  mkdir -p "$T/repo/mobile"
  cp "$ROOT/mobile/release.env" "$T/repo/mobile/release.env"
  echo '{"expo":{"extra":{"eas":{"projectId":"00000000-0000-0000-0000-000000000000"}}}}' >"$T/repo/mobile/app.json"
  (
    cd "$T/repo"
    git init -q
    git -c user.email=t@t -c user.name=t add -A
    git -c user.email=t@t -c user.name=t commit -qm "mobile: change"
    git remote add origin "$T/origin.git"
  )
  touch "$T/eas.log"
}

# run VAR=value ... : runs the release script in $T/repo; sets $out and $code.
run() {
  out="$(
    cd "$T/repo" &&
      env EAS_BIN="$T/bin/eas" FINGERPRINT_BIN="$T/bin/fingerprint" EAS_LOG="$T/eas.log" \
        GITHUB_STEP_SUMMARY="$T/summary" \
        MOCK_ENV_LIST="$GOOD_ENV" MOCK_IOS_FP="aaaaaaaaaaaa1111" \
        MOCK_BUILD_LIST='[{"id":"build-1"}]' MOCK_REMOTE_FP="same" MOCK_LOCAL_FP="same" \
        "$@" "$SCRIPT" 2>&1
  )" && code=0 || code=$?
}

tags() { git --git-dir="$T/origin.git" tag | sort | tr '\n' ' '; }
published() { grep -E '^(update|build) ' "$T/eas.log" || true; }
add_tag() {
  (cd "$T/repo" && git push -q origin "HEAD:refs/tags/$1")
}

# --- scenarios ---------------------------------------------------------------

# 1. Fingerprint unchanged on both platforms -> OTA only.
setup
add_tag ios-build-aaaaaaaaaaaa
run
if [ "$code" = 0 ] &&
  grep -q '^update --channel production --platform android --environment production' "$T/eas.log" &&
  grep -q '^update --channel production --platform ios --environment production' "$T/eas.log" &&
  ! grep -q '^build ' "$T/eas.log" && [ "$(tags)" = "ios-build-aaaaaaaaaaaa " ]; then
  ok "same fingerprint: OTA on both platforms, no build, no tag"
else bad "same fingerprint: OTA only" "$out"$'\n'"$(cat "$T/eas.log")"; fi

# 2. Fingerprint changed -> Android EAS build + auto submit, iOS tag push, no OTA.
setup
run MOCK_LOCAL_FP=other
if [ "$code" = 0 ] &&
  grep -q '^build -p android --profile production --auto-submit --non-interactive --no-wait' "$T/eas.log" &&
  ! grep -q '^update ' "$T/eas.log" && [ "$(tags)" = "ios-build-aaaaaaaaaaaa " ]; then
  ok "new fingerprint: android build + submit, ios tag ios-build-<hash12>"
else bad "new fingerprint: builds" "$out"$'\n'"$(cat "$T/eas.log")"$'\n'"tags: $(tags)"; fi

# 3. No finished Android store build yet -> build.
setup
add_tag ios-build-aaaaaaaaaaaa
run MOCK_BUILD_LIST='[]'
if [ "$code" = 0 ] && grep -q '^build -p android' "$T/eas.log" && grep -q '^update .*--platform ios' "$T/eas.log"; then
  ok "no android store build yet: build"
else bad "no android store build yet" "$out"; fi

# 4. Incomplete EAS production environment -> refuse, nothing published.
for broken in \
  "EXPO_PUBLIC_APP_ENV=production|EXPO_PUBLIC_API_MODE=live" \
  "EXPO_PUBLIC_APP_ENV=preview|EXPO_PUBLIC_API_MODE=live|EXPO_PUBLIC_API_URL=https://api.rentopya.example" \
  "EXPO_PUBLIC_APP_ENV=production|EXPO_PUBLIC_API_MODE=live|EXPO_PUBLIC_API_URL=http://api.rentopya.example" \
  "EXPO_PUBLIC_APP_ENV=production|EXPO_PUBLIC_API_URL=https://api.rentopya.example" \
  "EXPO_PUBLIC_APP_ENV=production|EXPO_PUBLIC_API_MODE=live|EXPO_PUBLIC_API_URL=https://api.rentopya.example|EXPO_PUBLIC_APPLE_SIGN_IN=0"; do
  setup
  run MOCK_ENV_LIST="${broken//|/$'\n'}" MOCK_LOCAL_FP=other
  if [ "$code" != 0 ] && [ -z "$(published)" ] && [ -z "$(tags)" ] && grep -q 'EAS production environment' <<<"$out"; then
    ok "incomplete EAS env refused: ${broken//|/ }"
  else bad "incomplete EAS env must be refused: ${broken//|/ }" "$out"; fi
done

# 5. Mock mode -> no OTA (EAS env in mock mode, or release.env changed to mock).
setup
add_tag ios-build-aaaaaaaaaaaa
run MOCK_ENV_LIST="${GOOD_ENV/API_MODE=live/API_MODE=mock}"
if [ "$code" != 0 ] && [ -z "$(published)" ]; then
  ok "EAS env in mock mode: no OTA"
else bad "EAS env in mock mode must not ship" "$out"; fi
setup
add_tag ios-build-aaaaaaaaaaaa
sed -i 's/^EXPO_PUBLIC_API_MODE=.*/EXPO_PUBLIC_API_MODE=mock/' "$T/repo/mobile/release.env"
run MOCK_ENV_LIST="${GOOD_ENV/API_MODE=live/API_MODE=mock}"
if [ "$code" != 0 ] && [ -z "$(published)" ]; then
  ok "release.env in mock mode: no OTA"
else bad "release.env in mock mode must not ship" "$out"; fi

# 6. Dry run -> decisions printed, no update, build or tag.
setup
run DRY_RUN=true MOCK_LOCAL_FP=other
if [ "$code" = 0 ] && [ -z "$(published)" ] && [ -z "$(tags)" ] &&
  grep -q 'android: EAS build' <<<"$out" && grep -q 'ios: Xcode Cloud build through tag ios-build-aaaaaaaaaaaa' <<<"$out" &&
  grep -q 'Dry run: nothing was published' <<<"$out"; then
  ok "dry run (builds): no side effects"
else bad "dry run (builds)" "$out"; fi
setup
add_tag ios-build-aaaaaaaaaaaa
run DRY_RUN=true
if [ "$code" = 0 ] && [ -z "$(published)" ] && grep -q 'android: OTA update' <<<"$out" && grep -q 'ios: OTA update' <<<"$out"; then
  ok "dry run (OTA): no side effects"
else bad "dry run (OTA)" "$out"; fi

# 7. Platform filter.
setup
run PLATFORM=android MOCK_LOCAL_FP=other
if [ "$code" = 0 ] && grep -q '^build -p android' "$T/eas.log" && [ -z "$(tags)" ]; then
  ok "PLATFORM=android: no iOS tag"
else bad "PLATFORM=android" "$out"; fi
setup
run PLATFORM=ios MOCK_LOCAL_FP=other
if [ "$code" = 0 ] && ! grep -qE '^(build:list|build|update)' "$T/eas.log" && [ "$(tags)" = "ios-build-aaaaaaaaaaaa " ]; then
  ok "PLATFORM=ios: no Android calls"
else bad "PLATFORM=ios" "$out"$'\n'"$(cat "$T/eas.log")"; fi
setup
run PLATFORM=web
if [ "$code" != 0 ] && [ ! -s "$T/eas.log" ]; then
  ok "unknown PLATFORM refused"
else bad "unknown PLATFORM" "$out"; fi

# 8. force_build -> builds although the fingerprint is unchanged; iOS gets -N+1.
setup
add_tag ios-build-aaaaaaaaaaaa
run FORCE_BUILD=true
if [ "$code" = 0 ] && grep -q '^build -p android' "$T/eas.log" && ! grep -q '^update ' "$T/eas.log" &&
  ! grep -q '^build:list' "$T/eas.log" && [ "$(tags)" = "ios-build-aaaaaaaaaaaa ios-build-aaaaaaaaaaaa-2 " ]; then
  ok "force_build: android build, ios tag -2"
else bad "force_build" "$out"$'\n'"tags: $(tags)"; fi

# 9. A failed decision never falls through to an OTA.
setup
add_tag ios-build-aaaaaaaaaaaa
run MOCK_BUILD_LIST_FAIL=1
if [ "$code" != 0 ] && [ -z "$(published)" ]; then
  ok "build:list failure: nothing published"
else bad "build:list failure must stop" "$out"; fi

# 10. No EAS project id -> refuse.
setup
echo '{"expo":{}}' >"$T/repo/mobile/app.json"
run
if [ "$code" != 0 ] && [ -z "$(published)" ] && grep -q 'projectId' <<<"$out"; then
  ok "missing projectId refused"
else bad "missing projectId" "$out"; fi

# 11. Xcode Cloud scripts: the committed ios/ci_scripts copies match the source.
for f in "$ROOT"/mobile/scripts/xcode-cloud/*.sh; do
  copy="$ROOT/mobile/ios/ci_scripts/$(basename "$f")"
  if cmp -s "$f" "$copy" && [ -x "$copy" ]; then
    ok "ios/ci_scripts/$(basename "$f") matches scripts/xcode-cloud"
  else bad "ios/ci_scripts/$(basename "$f") differs from scripts/xcode-cloud (run expo prebuild or copy it)"; fi
done

echo "$pass passed, $failures failed"
[ "$failures" = 0 ]

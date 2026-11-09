#!/usr/bin/env bash
# Ships mobile/ per platform: same native fingerprint -> EAS Update (OTA) on the
# production channel; new fingerprint -> a store build. Android builds on EAS and
# is submitted to Play internal (draft). iOS builds on Xcode Cloud, started by
# pushing an ios-build-<hash12> tag (Tag Changes start condition), so that tag
# also records which fingerprint iOS was last built from.
#
# Env: PLATFORM=all|ios|android  FORCE_BUILD=true|false  DRY_RUN=true|false
#      SHA (default HEAD), RELEASE_ENV_FILE (default mobile/release.env)
# Run from the repo root. EAS_BIN, FINGERPRINT_BIN and GIT_REMOTE exist for
# scripts/ci/mobile-release.test.sh. Docs: mobile/docs/OTA.md.
set -euo pipefail

PLATFORM="${PLATFORM:-all}"
FORCE_BUILD="${FORCE_BUILD:-false}"
DRY_RUN="${DRY_RUN:-false}"
SHA="${SHA:-$(git rev-parse HEAD)}"
EAS_BIN="${EAS_BIN:-npx --yes eas-cli@27}"
FINGERPRINT_BIN="${FINGERPRINT_BIN:-npx expo-updates fingerprint:generate}"
GIT_REMOTE="${GIT_REMOTE:-origin}"
SUMMARY="${GITHUB_STEP_SUMMARY:-/dev/null}"

case "$PLATFORM" in all | ios | android) ;; *)
  echo "::error::Unknown PLATFORM: $PLATFORM (all, ios or android)"
  exit 1
  ;;
esac
for flag in FORCE_BUILD DRY_RUN; do
  case "${!flag}" in true | false) ;; *)
    echo "::error::$flag must be true or false (got '${!flag}')"
    exit 1
    ;;
  esac
done

cd mobile
RELEASE_ENV_FILE="${RELEASE_ENV_FILE:-release.env}"

say() { echo "$1" | tee -a "$SUMMARY"; }
eas() { $EAS_BIN "$@"; }
fail() {
  echo "::error title=Mobile release::$1"
  exit 1
}

# The values workflow, EAS and Xcode Cloud share (mobile/release.env). They are
# exported here so the local iOS fingerprint is computed exactly as on Xcode Cloud.
declare -A RELEASE_VARS=()
load_release_env() {
  local line key value
  [ -f "$RELEASE_ENV_FILE" ] || fail "$RELEASE_ENV_FILE not found"
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in '' | '#'*) continue ;; esac
    [[ "$line" =~ ^[A-Z0-9_]+= ]] || fail "$RELEASE_ENV_FILE: not KEY=VALUE: $line"
    key="${line%%=*}"
    value="${line#*=}"
    RELEASE_VARS[$key]="$value"
    export "$key=$value"
  done <"$RELEASE_ENV_FILE"
  [ "${RELEASE_VARS[EXPO_PUBLIC_APP_ENV]:-}" = "production" ] ||
    fail "$RELEASE_ENV_FILE must set EXPO_PUBLIC_APP_ENV=production"
  # Never ship anything but the live API (no mock mode in a store binary or an OTA).
  [ "${RELEASE_VARS[EXPO_PUBLIC_API_MODE]:-}" = "live" ] ||
    fail "$RELEASE_ENV_FILE must set EXPO_PUBLIC_API_MODE=live"
}

check_project_id() {
  local id
  id="$(node -e 'const a=require("./app.json");process.stdout.write(a.expo?.extra?.eas?.projectId??"")')"
  [ -n "$id" ] || fail "app.json has no expo.extra.eas.projectId (run eas init once, see mobile/docs/OTA.md)"
}

# eas update does not read eas.json, so an incomplete EAS environment would ship
# an OTA built against the wrong API (or none) to production phones. Refuse
# before anything is published.
check_eas_env() {
  local vars key want have missing=""
  vars="$(eas env:list production --scope project --format short 2>/dev/null)" ||
    fail "eas env:list production failed (EXPO_TOKEN, project id?)"
  for key in "${!RELEASE_VARS[@]}"; do
    want="${RELEASE_VARS[$key]}"
    have="$(sed -n "s/^$key=//p" <<<"$vars" | head -n1)"
    if [ "$have" != "$want" ]; then
      missing="$missing $key=${want:-<unset>} (EAS: ${have:-<unset>})"
    fi
  done
  grep -qE '^EXPO_PUBLIC_API_URL=https://' <<<"$vars" || missing="$missing EXPO_PUBLIC_API_URL=https://..."
  if [ -n "$missing" ]; then
    echo "::error title=EAS production environment::Not as in mobile/$RELEASE_ENV_FILE:$missing"
    exit 1
  fi
}

fingerprint() {
  $FINGERPRINT_BIN --platform "$1" 2>/dev/null |
    node -e 'let s="";process.stdin.on("data",(d)=>(s+=d)).on("end",()=>console.log(JSON.parse(s).hash))'
}

# Prints "build" or "update".
decide_android() {
  local last cmp remote local_hash
  if [ "$FORCE_BUILD" = "true" ]; then
    echo build
    return
  fi
  last="$(eas build:list -p android --status finished --distribution store --limit 1 --json --non-interactive 2>/dev/null |
    sed -n '/^\[/,$p' | jq -r '.[0].id // empty')" || exit 1
  if [ -z "$last" ]; then
    echo "android: no finished store build yet" >&2
    echo build
    return
  fi
  cmp="$(eas fingerprint:compare --build-id "$last" --environment production --json --non-interactive 2>/dev/null |
    sed -n '/^{/,$p')" || exit 1
  remote="$(jq -r '.fingerprint1.hash // empty' <<<"$cmp")"
  local_hash="$(jq -r '.fingerprint2.hash // empty' <<<"$cmp")"
  echo "android: build $last fingerprint=$remote local=$local_hash" >&2
  if [ -n "$remote" ] && [ "$remote" = "$local_hash" ]; then echo update; else echo build; fi
}

ios_tags() { git ls-remote --tags --refs "$GIT_REMOTE" "refs/tags/ios-build-$1*" | awk '{print $2}'; }

# Prints "build <tag>" or "update".
decide_ios() {
  local hash existing count
  hash="$(fingerprint ios | cut -c1-12)" || exit 1
  if [ -z "$hash" ]; then
    echo "::error::Could not compute the iOS fingerprint" >&2
    exit 1
  fi
  existing="$(ios_tags "$hash")" || exit 1
  echo "ios: fingerprint=$hash tags=[${existing//$'\n'/ }]" >&2
  if [ -z "$existing" ]; then
    echo "build ios-build-$hash"
  elif [ "$FORCE_BUILD" = "true" ]; then
    count="$(wc -l <<<"$existing" | tr -d ' ')"
    echo "build ios-build-$hash-$((count + 1))"
  else
    echo update
  fi
}

publish_update() {
  # Checked again right before publishing: an OTA in mock mode must never ship.
  [ "${EXPO_PUBLIC_API_MODE:-}" = "live" ] || fail "refusing an OTA with EXPO_PUBLIC_API_MODE=${EXPO_PUBLIC_API_MODE:-<unset>}"
  say "$1: OTA update to channel production"
  [ "$DRY_RUN" = "true" ] && return
  eas update --channel production --platform "$1" --environment production --non-interactive \
    --message "${SHA:0:8}: $(git log -1 --format=%s "$SHA" | cut -c1-100)"
}

load_release_env
check_project_id
check_eas_env

# Decisions are assigned first: a failed decision must stop here and never fall
# through to an OTA.
if [ "$PLATFORM" != "ios" ]; then
  android_action="$(decide_android)"
fi
if [ "$PLATFORM" != "android" ]; then
  ios_decision="$(decide_ios)"
fi

if [ "$PLATFORM" != "ios" ]; then
  if [ "$android_action" = "build" ]; then
    say "android: EAS build, then submit to Play internal (draft)"
    if [ "$DRY_RUN" != "true" ]; then
      eas build -p android --profile production --auto-submit --non-interactive --no-wait
    fi
  else
    publish_update android
  fi
fi

if [ "$PLATFORM" != "android" ]; then
  read -r action tag <<<"$ios_decision"
  if [ "$action" = "build" ]; then
    say "ios: Xcode Cloud build through tag $tag"
    if [ "$DRY_RUN" != "true" ]; then
      git push "$GIT_REMOTE" "$SHA:refs/tags/$tag"
    fi
  else
    publish_update ios
  fi
fi

if [ "$DRY_RUN" = "true" ]; then say "Dry run: nothing was published."; fi
exit 0

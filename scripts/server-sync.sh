#!/usr/bin/env bash
# DEPRECATED (TEC-1133): production pulls the images CI publishes to GHCR
# (compose.prod.yml runs ${IMAGE_REPO}-<service>:${IMAGE_TAG}; Dokploy deploys
# the v0.N release tags). This cron stays for a plain Docker host until that
# host is switched to Dokploy; see docs/DEVELOPMENT.md → Production.
#
# Pull the deploy branch and redeploy the production stack when it moved.
# Meant for cron on a plain Docker host, e.g. every 5 minutes:
#
#   */5 * * * * /opt/rentopia/scripts/server-sync.sh >> /var/log/rentopia-sync.log 2>&1
#
#   scripts/server-sync.sh [--force] [--dry-run]
#     --force    redeploy even if the branch did not move
#     --dry-run  only report whether an update is pending
#
# Environment (all optional):
#   BRANCH=main            branch to follow (only CI-green commits reach main)
#   ENV_FILE=.env.server   production env file (see scripts/prod-env.sh)
#   SYNC_MODE=build        build: build the images on this host (the previous
#                          behaviour, compose.build.yml) under IMAGE_TAG=local.
#                          pull: pull the GHCR images CI published for the
#                          target commit (:sha-<short>, needs `docker login
#                          ghcr.io` for private packages); nothing is built, and
#                          the branch does not move until the pull succeeds.
#   SYNC_IMAGE_TAG=local   image tag in build mode
#   HEALTH_TIMEOUT=300     seconds to wait for the backend to become healthy
#   SYNC_LOCK=/tmp/<repo>-sync.lock
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BRANCH="${BRANCH:-main}"
ENV_FILE="${ENV_FILE:-.env.server}"
SYNC_MODE="${SYNC_MODE:-build}"
SYNC_IMAGE_TAG="${SYNC_IMAGE_TAG:-local}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-300}"
SYNC_LOCK="${SYNC_LOCK:-/tmp/$(basename "$ROOT")-sync.lock}"
FORCE=false; DRY_RUN=false
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=true ;;
    --dry-run) DRY_RUN=true ;;
    -h|--help) sed -n '2,27p' "$0"; exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

log() { printf '[%s] %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$*"; }
case "$SYNC_MODE" in
  build) compose() { docker compose --env-file "$ENV_FILE" -f compose.prod.yml -f compose.build.yml "$@"; } ;;
  pull) compose() { docker compose --env-file "$ENV_FILE" -f compose.prod.yml "$@"; } ;;
  *) echo "unknown SYNC_MODE: $SYNC_MODE (build or pull)" >&2; exit 2 ;;
esac

# One sync at a time; a long build must not be started twice by cron.
exec 9>"$SYNC_LOCK"
flock -n 9 || { log "another sync is running; skipping"; exit 0; }

PAUSED=false
if [[ -f .sync-paused ]]; then
  PAUSED=true
  [[ "$FORCE" == true ]] || { log "paused (.sync-paused exists); skipping"; exit 0; }
fi

[[ -f "$ENV_FILE" ]] || { log "missing $ENV_FILE; create it with: scripts/prod-env.sh init -o $ENV_FILE"; exit 1; }

current="$(git rev-parse HEAD)"
if [[ "$PAUSED" == true ]]; then
  target="$current"; log "paused: rebuilding ${current:0:7} without pulling"
else
  git fetch --quiet origin "$BRANCH"
  target="$(git rev-parse "origin/$BRANCH")"
fi

if [[ "$current" == "$target" && "$FORCE" == false ]]; then
  log "up to date at ${current:0:7}"
  exit 0
fi
if [[ "$DRY_RUN" == true ]]; then
  log "update pending: ${current:0:7} -> ${target:0:7}"
  git --no-pager log --oneline "$current..$target" | head -20
  exit 0
fi

# The shell value wins over the env file's IMAGE_TAG (compose interpolation).
if [[ "$SYNC_MODE" == pull ]]; then
  export IMAGE_TAG="sha-${target:0:7}" IMAGE_PULL_POLICY=always
  # Pull before moving the branch: CI publishes the images after main moved,
  # so a pull that fails leaves everything as it was for the next run.
  log "pulling images :$IMAGE_TAG"
  if ! compose pull --quiet; then
    log "could not pull :$IMAGE_TAG (not published yet, or no ghcr.io login); staying at ${current:0:7}"
    exit 1
  fi
else
  export IMAGE_TAG="$SYNC_IMAGE_TAG"
fi

if [[ "$current" != "$target" ]]; then
  if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
    log "tracked files changed locally; refusing to pull. Inspect with: git -C $ROOT status"
    exit 1
  fi
  log "updating ${current:0:7} -> ${target:0:7}"
  git --no-pager log --oneline "$current..$target" | head -20
  git checkout --quiet "$BRANCH" 2>/dev/null || git checkout --quiet -B "$BRANCH" "origin/$BRANCH"
  git merge --quiet --ff-only "origin/$BRANCH"
fi

# A release may add env keys; upgrade keeps every existing value.
if ! scripts/prod-env.sh check "$ENV_FILE" >/dev/null 2>&1; then
  log "env schema changed; upgrading $ENV_FILE (backup kept)"
  scripts/prod-env.sh upgrade "$ENV_FILE"
fi

compose config -q
if [[ "$SYNC_MODE" == pull ]]; then
  log "starting :$IMAGE_TAG"
  compose up -d --remove-orphans
else
  log "building and starting (deprecated: production pulls GHCR images)"
  compose up -d --build --remove-orphans
fi

prefix="$(grep -E '^NAME_PREFIX=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"')"
backend="${prefix:-rentopia}-backend"
deadline=$(( $(date +%s) + HEALTH_TIMEOUT ))
status=""
while (( $(date +%s) < deadline )); do
  status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$backend" 2>/dev/null || true)"
  [[ "$status" == "healthy" ]] && break
  sleep 5
done
if [[ "$status" != "healthy" ]]; then
  log "backend is '$status' after ${HEALTH_TIMEOUT}s; check: docker logs $backend"
  log "previous commit was ${current:0:7}. To roll back code: touch $ROOT/.sync-paused && git -C $ROOT checkout $current && SYNC_MODE=$SYNC_MODE $0 --force (migrations are not reverted)"
  exit 1
fi

docker image prune -f >/dev/null 2>&1 || true
# Pull mode keeps one tag per commit: drop the previous commit's images.
if [[ "$SYNC_MODE" == pull && "$current" != "$target" ]]; then
  IMAGE_TAG="sha-${current:0:7}" compose config --images 2>/dev/null | xargs -r docker image rm >/dev/null 2>&1 || true
fi
log "deployed ${target:0:7}"

#!/usr/bin/env bash
# Keeps the env files in line with deploy/env/schema (docs/design/env-core.md):
#   1. .env.server.example is exactly `scripts/prod-env.sh example` output
#      (fix: scripts/prod-env.sh example > .env.server.example)
#   2. every schema key also has a local default in .env.example
#   3. every ${VAR} compose.prod.yml interpolates is a schema key or documented
#      in .env.example (a production knob nobody can find is a silent default)
#   4. scripts/prod-env.test.sh passes (skip with --no-tests)
# Run: make env-check
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT"
run_tests=1
[[ ${1:-} == --no-tests ]] && run_tests=0
status=0

T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
scripts/prod-env.sh example >"$T/example"
if ! diff -u --label .env.server.example --label "prod-env.sh example" .env.server.example "$T/example"; then
  echo "check-env-sync: .env.server.example is out of date with deploy/env/schema." >&2
  echo "  fix: scripts/prod-env.sh example > .env.server.example" >&2
  status=1
fi

sed -nE 's/^([A-Z][A-Z0-9_]*)[[:space:]]*\|.*/\1/p' deploy/env/schema | sort -u >"$T/schema"
sed -nE 's/^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)=.*/\2/p' .env.example | sort -u >"$T/dev"

missing=$(comm -23 "$T/schema" "$T/dev")
if [[ -n $missing ]]; then
  echo "check-env-sync: schema keys without a local default in .env.example:" >&2
  sed 's/^/  /' <<<"$missing" >&2
  status=1
fi

undocumented=$(grep -oE '\$\{[A-Z][A-Z0-9_]*' compose.prod.yml | sed 's/^\${//' | sort -u |
  comm -23 - "$T/schema" | comm -23 - "$T/dev")
if [[ -n $undocumented ]]; then
  echo "check-env-sync: compose.prod.yml reads keys that are neither in deploy/env/schema nor in .env.example:" >&2
  sed 's/^/  /' <<<"$undocumented" >&2
  echo "  fix: add operator-facing keys to the schema (bump @version), document tunables in .env.example" >&2
  status=1
fi

if ((run_tests)); then
  scripts/prod-env.test.sh >"$T/test.out" 2>&1 || {
    cat "$T/test.out" >&2
    echo "check-env-sync: scripts/prod-env.test.sh failed" >&2
    status=1
  }
fi

((status)) || echo "check-env-sync: ok"
exit "$status"

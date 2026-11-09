#!/usr/bin/env bash
# Tests for scripts/prod-env.sh. Run: scripts/prod-env.test.sh (make env-check runs it).
# Uses a temp dir; the repository is not modified.
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
PE=$ROOT/scripts/prod-env.sh
SCHEMA=$ROOT/deploy/env/schema
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT

pass=0
ok() { pass=$((pass + 1)); echo "ok  - $*"; }
fail() { echo "FAIL - $*" >&2; exit 1; }
val() { grep -E "^$1=" "$2" | tail -n1 | cut -d= -f2-; }
values() { grep -E '^[A-Z_]+=' "$1" | grep -v '^ENV_SCHEMA_VERSION=' | sort; }
version=$(sed -nE 's/^@version ([0-9]+)/\1/p' "$SCHEMA")

# --- init --------------------------------------------------------------------
E=$T/env
"$PE" init -o "$E" --app-url https://demo.example.com/ >/dev/null </dev/null
[[ $(stat -c %a "$E" 2>/dev/null || stat -f %Lp "$E") == 600 ]] || fail "init: file mode is not 600"
while IFS= read -r key; do
  grep -qE "^$key=" "$E" || fail "init: $key missing"
done < <(sed -nE 's/^([A-Z][A-Z0-9_]*)[[:space:]]*\|.*/\1/p' "$SCHEMA")
[[ $(val ENV_SCHEMA_VERSION "$E") == "$version" ]] || fail "init: version stamp"
ok "init writes a mode-600 file with every schema key and ENV_SCHEMA_VERSION"

[[ $(val APP_URL "$E") == https://demo.example.com ]] || fail "APP_URL trailing slash"
[[ $(val CENTRIFUGO_WS_URL "$E") == wss://realtime.demo.example.com/connection/websocket ]] || fail "CENTRIFUGO_WS_URL"
[[ $(val CORS_ALLOWED_ORIGINS "$E") == https://demo.example.com ]] || fail "derive from APP_URL"
[[ $(val AUTH_WEBAUTHN_RP_ID "$E") == demo.example.com ]] || fail "derive {APP_HOST}"
ok "init derives URLs and origins from APP_URL"

[[ $(val JWT_ACCESS_SECRET "$E") =~ ^[0-9a-f]{64}$ ]] || fail "hex:32 secret"
[[ $(val DB_PASSWORD "$E") =~ ^[A-Za-z0-9]{32}$ ]] || fail "alnum:32 secret"
[[ $(val APP_ENCRYPTION_KEY "$E" | openssl base64 -d -A | wc -c | tr -d ' ') == 32 ]] || fail "b64:32 decodes to 32 bytes"
[[ $(val JWT_ACCESS_SECRET "$E") != "$(val JWT_REFRESH_SECRET "$E")" ]] || fail "secrets are distinct"
pub=$(val VAPID_PUBLIC_KEY "$E")
priv=$(val VAPID_PRIVATE_KEY "$E")
[[ ${#pub} -eq 87 && ${#priv} -eq 43 ]] || fail "VAPID key lengths ${#pub}/${#priv}"
ok "secrets and the VAPID pair have the requested format"

grep -qF '# Branded site (TEC-729)' "$E" || fail "operator notes are copied"
if grep -q '^##' "$E"; then fail "schema-only ## notes leak into the env file"; fi
ok "'#' notes are copied, '##' notes are not"

if "$PE" init -o "$E" --app-url https://demo.example.com >/dev/null 2>&1 </dev/null; then fail "init overwrote a file"; fi
if "$PE" init -o "$T/nourl" >/dev/null 2>&1 </dev/null; then fail "init without --app-url and no tty"; fi
if "$PE" init -o "$T/badurl" --app-url https://demo.example.com/path >/dev/null 2>&1 </dev/null; then fail "init accepted a path"; fi
ok "init refuses an existing file, a missing or invalid APP_URL"

# --- check -------------------------------------------------------------------
"$PE" check "$E" >/dev/null || fail "check on a fresh file"
ok "check passes on a fresh file"

cp "$E" "$T/missing"
sed -i.bak '/^SMTP_PORT=/d' "$T/missing"
out=$("$PE" check "$T/missing" 2>&1) && fail "check missed a missing key"
grep -q 'missing: SMTP_PORT' <<<"$out" || fail "check output: $out"
ok "check fails on a missing key"

cp "$E" "$T/empty"
sed -i.bak 's/^DB_PASSWORD=.*/DB_PASSWORD=/' "$T/empty"
out=$("$PE" check "$T/empty" 2>&1) && fail "check missed an empty secret"
grep -q 'empty (must have a value): DB_PASSWORD' <<<"$out" || fail "check output: $out"
ok "check fails on an empty secret"

dev=$(grep -E '^JWT_ACCESS_SECRET=' "$ROOT/.env.example" | cut -d= -f2-)
cp "$E" "$T/insecure"
sed -i.bak "s/^JWT_ACCESS_SECRET=.*/JWT_ACCESS_SECRET=$dev/" "$T/insecure"
out=$("$PE" check "$T/insecure" 2>&1) && fail "check missed a development secret"
grep -q 'insecure.*JWT_ACCESS_SECRET' <<<"$out" || fail "check output: $out"
ok "check fails on a secret still holding its .env.example value"

cp "$E" "$T/old"
sed -i.bak "s/^ENV_SCHEMA_VERSION=.*/ENV_SCHEMA_VERSION=$((version - 1))/" "$T/old"
"$PE" check "$T/old" >/dev/null 2>&1 && fail "check missed a version gap"
ok "check fails on a schema version gap"

# --- upgrade -----------------------------------------------------------------
U=$T/up
cp "$E" "$U"
sed -i.bak -e '/^SMTP_PORT=/d' -e '/^WUZAPI_ADMIN_TOKEN=/d' -e 's/^DB_PASSWORD=.*/DB_PASSWORD=/' \
  -e "s/^ENV_SCHEMA_VERSION=.*/ENV_SCHEMA_VERSION=$((version - 1))/" "$U"
echo 'CUSTOM_KEY=keep me' >>"$U"
before=$(values "$U" | grep -vE '^(SMTP_PORT|WUZAPI_ADMIN_TOKEN|DB_PASSWORD|CUSTOM_KEY)=')
"$PE" upgrade "$U" >/dev/null
after=$(values "$U" | grep -vE '^(SMTP_PORT|WUZAPI_ADMIN_TOKEN|DB_PASSWORD|CUSTOM_KEY)=')
[[ $before == "$after" ]] || fail "upgrade changed an existing value"
[[ $(val SMTP_PORT "$U") == 587 ]] || fail "upgrade: const key"
[[ $(val WUZAPI_ADMIN_TOKEN "$U") =~ ^[0-9a-f]{64}$ ]] || fail "upgrade: missing secret generated"
[[ $(val DB_PASSWORD "$U") =~ ^[A-Za-z0-9]{32}$ ]] || fail "upgrade: empty secret regenerated"
[[ $(val CUSTOM_KEY "$U") == '"keep me"' ]] || fail "upgrade: unmanaged key kept"
[[ $(val ENV_SCHEMA_VERSION "$U") == "$version" ]] || fail "upgrade: version stamp"
ls "$U".bak.* >/dev/null 2>&1 || fail "upgrade: no backup"
"$PE" check "$U" >/dev/null || fail "check after upgrade"
ok "upgrade keeps every value, fills missing/empty keys, keeps unmanaged keys, backs up"

cp "$E" "$T/same"
cp "$E" "$T/same.orig"
"$PE" upgrade "$T/same" >/dev/null
[[ $(values "$T/same") == "$(values "$T/same.orig")" ]] || fail "upgrade of a current file changed values"
ok "upgrade of a current file is a no-op for values"

cat >"$T/schema" <<'S'
@version 3
@rename OLD_NAME NEW_NAME 2
@remove GONE 3
# --- Test ---
APP_URL | ask:APP_URL
NEW_NAME | const:x
S
printf 'ENV_SCHEMA_VERSION=1\nAPP_URL=https://a.example.com\nOLD_NAME=kept\nGONE=bye\n' >"$T/mig"
PROD_ENV_SCHEMA=$T/schema "$PE" upgrade "$T/mig" >/dev/null
[[ $(val NEW_NAME "$T/mig") == kept ]] || fail "rename keeps the value"
grep -q '^OLD_NAME=' "$T/mig" && fail "rename leaves the old key"
grep -q '^# GONE=bye' "$T/mig" || fail "remove comments the key out"
ok "upgrade applies @rename and @remove"

# --- example -----------------------------------------------------------------
"$PE" example >"$T/ex1"
"$PE" example >"$T/ex2"
cmp -s "$T/ex1" "$T/ex2" || fail "example is not deterministic"
while IFS= read -r key; do
  grep -qE "^$key=" "$T/ex1" || fail "example: $key missing"
done < <(sed -nE 's/^([A-Z][A-Z0-9_]*)[[:space:]]*\|.*/\1/p' "$SCHEMA")
while IFS= read -r key; do
  [[ -z $(val "$key" "$T/ex1") ]] || fail "example: secret $key is not blank"
done < <(sed -nE 's/^([A-Z][A-Z0-9_]*)[[:space:]]*\|[[:space:]]*(secret|vapid):.*/\1/p' "$SCHEMA")
[[ $(val APP_URL "$T/ex1") == https://app.example.com ]] || fail "example APP_URL"
ok "example is deterministic, lists every key and leaves secrets blank"

echo "prod-env.test: $pass passed"

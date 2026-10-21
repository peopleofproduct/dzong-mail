#!/usr/bin/env bash
# Reserve the Dzong Mail names on npm by publishing minimal placeholder
# packages. Run `npm login` first. Nothing here is the real product - each
# stub is a pointer to the repo so squatters and confused installers land
# somewhere useful. Re-run is safe: it skips names already claimed by you.
#
#   bash scripts/reserve-npm.sh            # reserve all names
#   bash scripts/reserve-npm.sh dzong-mail # reserve a subset
#   NPM_OTP=123456 bash scripts/reserve-npm.sh   # accounts with publish 2FA
set -euo pipefail

REPO="https://github.com/peopleofproduct/dzong-mail"
OTP_ARGS=()
if [ "${NPM_OTP:-}" != "" ]; then OTP_ARGS=(--otp="$NPM_OTP"); fi
# Names already owned by this account are skipped. Unscoped "dzong" and
# "dzongmail" are rejected by npm's similar-name protection (too close to
# "long" and "dzong-mail" respectively), which also blocks squatters, so
# they are not in the list. Scoped @dzong/* publishes require an npm
# organization named "dzong" - create it at npmjs.com/org/create first.
NAMES=("@dzong/core" "dzong-mail")
if [ $# -gt 0 ]; then NAMES=("$@"); fi

if ! npm whoami >/dev/null 2>&1; then
  echo "Not logged in to npm. Run 'npm login' first." >&2
  exit 1
fi
echo "Reserving npm names as $(npm whoami)..."

for name in "${NAMES[@]}"; do
  dir="$(mktemp -d)/pkg"
  mkdir -p "$dir"
  # Scoped names (@dzong/core) need --access public; unscoped are public anyway.
  cat > "$dir/package.json" <<JSON
{
  "name": "$name",
  "version": "0.0.1",
  "description": "Name reserved for Dzong Mail - see $REPO",
  "homepage": "$REPO",
  "license": "MIT",
  "private": false,
  "publishConfig": { "access": "public" }
}
JSON
  cat > "$dir/README.md" <<MD
# $name

Placeholder reserving this name for **Dzong Mail** - the open-source,
local-first AI email client. See $REPO
MD
  if npm view "$name" version >/dev/null 2>&1; then
    owner="$(npm view "$name" maintainers --json 2>/dev/null || echo '[]')"
    echo "- $name already published ($owner) - skipping"
  else
    (cd "$dir" && npm publish --access public "${OTP_ARGS[@]}") && echo "+ $name reserved"
  fi
done
echo "Done. To keep the names, bump versions or publish the real packages later."

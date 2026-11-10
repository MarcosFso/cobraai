#!/usr/bin/env bash
# Resets the password of any account, from the server. This is the way back in for the owner of a company who has no
# other administrator above them (a company administrator can reset the members, but not themselves).
#
#   bash deploy/reset-password.sh person@company.com            # generates a temporary password and prints it
#   bash deploy/reset-password.sh person@company.com MyTemp123  # or use the one you choose (8 to 72 characters)
#
# The person has to choose a new password at the next login (same screen as when an administrator resets it).
set -euo pipefail

EMAIL="${1:?usage: bash deploy/reset-password.sh person@company.com [temporary-password]}"
TEMP="${2:-}"
if [ -z "$TEMP" ]; then
  # head closes the pipe once it has 12 characters, which makes tr exit early: that is expected, hence the `|| true`
  TEMP="$( (LC_ALL=C tr -dc 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789' </dev/urandom | head -c 12) || true)"
fi
if [ "${#TEMP}" -lt 8 ] || [ "${#TEMP}" -gt 72 ]; then
  echo "The temporary password needs 8 to 72 characters." >&2
  exit 1
fi

cd "$(dirname "$0")/.."
if docker info >/dev/null 2>&1; then DOCKER="docker"; else DOCKER="sudo docker"; fi
DC="$DOCKER compose --env-file deploy/.env -f deploy/docker-compose.prod.yml"

# pgcrypto makes the same kind of BCrypt hash the billing service checks. The values go in as psql variables
# (quoted by psql), never pasted into the SQL text, so odd characters cannot break or inject anything.
UPDATED="$($DC exec -T postgres psql -U billing -d billing -tA -v ON_ERROR_STOP=1 -v email="$EMAIL" -v pw="$TEMP" <<'SQL'
CREATE EXTENSION IF NOT EXISTS pgcrypto;
UPDATE users
   SET password_hash = crypt(:'pw', gen_salt('bf', 10)), must_change_password = TRUE
 WHERE lower(email) = lower(:'email')
RETURNING email;
SQL
)"

# psql prints the extension notice and the row; only a real e-mail address means an account was updated
if ! printf '%s\n' "$UPDATED" | grep -qi "^$(printf '%s' "$EMAIL" | sed 's/[.[\*^$/]/\\&/g')\$"; then
  echo "No account with the e-mail $EMAIL." >&2
  exit 1
fi

echo "Password reset for $EMAIL"
echo "Temporary password: $TEMP"
echo "The person must choose a new password at the next login."

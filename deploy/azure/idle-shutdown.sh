#!/usr/bin/env bash
# Stops (deallocates) THIS Azure VM when nobody has used the site for a while, so the free student credit lasts longer.
# A deallocated VM costs only its disk and static IP; start it again from the Azure portal (it comes back in 2-3 minutes
# with the same address and the same data).
#
# "Used" = a request to /api/*, /mail or /kafka in the last IDLE_HOURS hours (health checks and the plain site page do
# not count, because internet scanners hit those all day). Runs from cron every 10 minutes (see enable-idle-shutdown.sh).
#
# It asks Azure to deallocate with the VM's own managed identity, which needs the role "Virtual Machine Contributor"
# on the resource group. Without that role it only writes a line to the log and does nothing.
#
#   DRY_RUN=1 bash deploy/azure/idle-shutdown.sh     # show the decision without stopping anything
set -euo pipefail

IDLE_HOURS="${IDLE_HOURS:-3}"
DRY_RUN="${DRY_RUN:-0}"
CADDY="billing-prod-caddy-1"
log() { echo "$(date -u +%FT%TZ) $*"; }

# Never stop a machine that has just started: give people time to arrive (and the logs time to fill up).
UPTIME_S="$(cut -d. -f1 /proc/uptime)"
if [ "$UPTIME_S" -lt $((IDLE_HOURS * 3600)) ]; then
  log "up for $((UPTIME_S / 60)) min, less than ${IDLE_HOURS} h: nothing to do"
  exit 0
fi

HITS="$(sudo docker logs --since "${IDLE_HOURS}h" "$CADDY" 2>&1 | grep -E '"uri":"/(api|mail|kafka)' | grep -vc '/health' || true)"
if [ "${HITS:-0}" -gt 0 ]; then
  log "active: ${HITS} requests in the last ${IDLE_HOURS} h"
  exit 0
fi

log "idle: no requests in the last ${IDLE_HOURS} h"
if [ "$DRY_RUN" = "1" ]; then
  log "DRY_RUN: would deallocate this VM now"
  exit 0
fi

META="$(curl -fsS -H Metadata:true 'http://169.254.169.254/metadata/instance/compute?api-version=2021-02-01')"
SUB="$(printf '%s' "$META" | python3 -c 'import sys,json; print(json.load(sys.stdin)["subscriptionId"])')"
RG="$(printf '%s' "$META" | python3 -c 'import sys,json; print(json.load(sys.stdin)["resourceGroupName"])')"
VM="$(printf '%s' "$META" | python3 -c 'import sys,json; print(json.load(sys.stdin)["name"])')"
TOKEN="$(curl -fsS -H Metadata:true 'http://169.254.169.254/metadata/identity/oauth2/token?api-version=2018-02-01&resource=https://management.azure.com/' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')" || { log "no managed identity token: turn the identity on in the portal"; exit 0; }

URL="https://management.azure.com/subscriptions/${SUB}/resourceGroups/${RG}/providers/Microsoft.Compute/virtualMachines/${VM}/deallocate?api-version=2024-03-01"
CODE="$(curl -sS -o /tmp/deallocate.out -w '%{http_code}' -X POST -H "Authorization: Bearer ${TOKEN}" -H 'Content-Length: 0' "$URL" || echo 000)"
case "$CODE" in
  200|202) log "deallocate requested (HTTP ${CODE}); the VM stops in a minute" ;;
  *) log "deallocate refused (HTTP ${CODE}): $(head -c 300 /tmp/deallocate.out). Missing role Virtual Machine Contributor?" ;;
esac

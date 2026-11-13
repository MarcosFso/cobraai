#!/usr/bin/env bash
# Turns on the automatic stop for an idle VM: a cron job that runs idle-shutdown.sh every 10 minutes.
#
#   bash deploy/azure/enable-idle-shutdown.sh        # default: stop after 3 hours without use
#   IDLE_HOURS=6 bash deploy/azure/enable-idle-shutdown.sh
#   sudo rm /etc/cron.d/idle-shutdown                 # turn it off
set -euo pipefail

cd "$(dirname "$0")/../.."
SCRIPT="$(pwd)/deploy/azure/idle-shutdown.sh"
IDLE_HOURS="${IDLE_HOURS:-3}"
chmod +x "$SCRIPT"

echo "*/10 * * * * root IDLE_HOURS=${IDLE_HOURS} /usr/bin/bash ${SCRIPT} >> /var/log/idle-shutdown.log 2>&1" | sudo tee /etc/cron.d/idle-shutdown > /dev/null
sudo chmod 644 /etc/cron.d/idle-shutdown
echo "Done: this VM stops by itself after ${IDLE_HOURS} h without use. Log: /var/log/idle-shutdown.log"
echo "Check what it would do now:  DRY_RUN=1 bash ${SCRIPT}"

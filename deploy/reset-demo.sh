#!/usr/bin/env bash
# Nightly reset of the demo: wipes the data volumes (database, Redis, Kafka, notification history) and seeds again.
# The HTTPS certificates live in their own volume and are kept, so Let's Encrypt is not asked again.
set -euo pipefail

cd "$(dirname "$0")/.."
DC="${DC:-docker compose --env-file deploy/.env -f deploy/docker-compose.prod.yml}"
PROJECT=billing-prod

echo "[$(date -Is)] resetting demo"
$DC down
for volume in postgres-data redis-data kafka-data notification-data; do
  docker volume rm "${PROJECT}_${volume}" > /dev/null 2>&1 || true
done
$DC up -d
bash deploy/seed-demo.sh
echo "[$(date -Is)] demo reset done"

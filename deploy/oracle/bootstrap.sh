#!/usr/bin/env bash
# One-shot setup for a fresh Ubuntu server (made for Oracle Cloud "Always Free" Ampere A1, but works on any
# Ubuntu box with 4+ GB of RAM). Run it from inside the cloned repository:
#
#   bash deploy/oracle/bootstrap.sh your-name.duckdns.org [password]
#
# It installs Docker, opens ports 80/443, writes deploy/.env, builds and starts the stack, loads the demo data
# and schedules the nightly reset. Running it again is safe (the .env and the database are kept).
set -euo pipefail

DOMAIN="${1:?usage: bash deploy/oracle/bootstrap.sh your-domain.duckdns.org [password]}"
cd "$(dirname "$0")/../.."
REPO="$(pwd)"
DC="sudo docker compose --env-file deploy/.env -f deploy/docker-compose.prod.yml"

echo "==> Docker"
if ! command -v docker > /dev/null; then
  curl -fsSL https://get.docker.com | sudo sh
fi

echo "==> Firewall (Oracle's Ubuntu images block everything but SSH by default)"
if command -v iptables > /dev/null; then
  for port in 80 443; do
    sudo iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2> /dev/null \
      || sudo iptables -I INPUT 5 -p tcp --dport "$port" -j ACCEPT
  done
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq iptables-persistent > /dev/null 2>&1 || true
  sudo netfilter-persistent save > /dev/null 2>&1 || true
fi

echo "==> Configuration"
if [ ! -f deploy/.env ]; then
  PASSWORD="${2:-$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-12)}"
  HASH="$(sudo docker run --rm caddy:2 caddy hash-password --plaintext "$PASSWORD")"
  {
    echo "SITE_ADDRESS=$DOMAIN"
    echo "BASIC_USER=visitante"
    echo "BASIC_HASH='$HASH'"
    echo "POSTGRES_PASSWORD=$(openssl rand -base64 18 | tr -d '/+=')"
  } > deploy/.env
  chmod 600 deploy/.env
  echo "$PASSWORD" > deploy/.visitor-password
  chmod 600 deploy/.visitor-password
else
  echo "deploy/.env already exists, keeping it"
fi

echo "==> Building and starting (the first build takes several minutes)"
$DC up -d --build

echo "==> Demo data"
DC="$DC" bash deploy/seed-demo.sh

echo "==> Nightly reset at 03:30 Sao Paulo time (06:30 UTC)"
CRON_LINE="30 6 * * * cd $REPO && bash deploy/reset-demo.sh >> /var/log/billing-reset.log 2>&1"
( sudo crontab -l 2> /dev/null | grep -v 'deploy/reset-demo.sh' || true; echo "$CRON_LINE" ) | sudo crontab -

echo
echo "=============================================================="
echo " Ready:     https://$DOMAIN"
echo " Login:     visitante / $(cat deploy/.visitor-password)"
echo " Messages:  https://$DOMAIN/kafka     E-mails: https://$DOMAIN/mail"
echo " (the HTTPS certificate can take a minute on the first visit)"
echo "=============================================================="

#!/usr/bin/env bash
# One-shot setup for a fresh Ubuntu server (made for Oracle Cloud "Always Free" Ampere A1, but works on any
# Ubuntu box with 2+ GB of RAM: it adds a 2 GB swap file when the machine is small). Run it from inside the cloned
# repository:
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

echo "==> Memory"
TOTAL_MB="$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)"
echo "RAM: ${TOTAL_MB} MB"
if [ "$TOTAL_MB" -lt 3500 ] && [ "$(swapon --show --noheadings | wc -l)" -eq 0 ]; then
  # A safety net for a small machine: when memory runs short the kernel swaps instead of killing a service.
  echo "Small machine: creating a 2 GB swap file"
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile > /dev/null
  sudo swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab > /dev/null
  echo 'vm.swappiness=20' | sudo tee /etc/sysctl.d/99-swappiness.conf > /dev/null
  sudo sysctl -q -p /etc/sysctl.d/99-swappiness.conf
fi
if [ "$TOTAL_MB" -lt 1700 ]; then
  echo "WARNING: less than 2 GB of RAM. The stack needs about 1.1 GB plus the system; it may not fit." >&2
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
  # Password of the owner tools only (/kafka and /mail). Companies use the login of the site itself.
  PASSWORD="${2:-$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-12)}"
  HASH="$(sudo docker run --rm caddy:2 caddy hash-password --plaintext "$PASSWORD")"
  {
    echo "SITE_ADDRESS=$DOMAIN"
    echo "BASIC_USER=visitante"
    echo "BASIC_HASH='$HASH'"
    echo "POSTGRES_PASSWORD=$(openssl rand -base64 18 | tr -d '/+=')"
    echo "JWT_SECRET=$(openssl rand -hex 32)" # signs the login tokens; shared by the three services
  } > deploy/.env
  chmod 600 deploy/.env
  echo "$PASSWORD" > deploy/.visitor-password
  chmod 600 deploy/.visitor-password
else
  echo "deploy/.env already exists, keeping it"
fi

echo "==> Building and starting (the first build takes several minutes)"
$DC up -d --build

echo
echo "=============================================================="
echo " Ready:     https://$DOMAIN"
echo ' Anyone can create a company account on the site, or use the visitor button.'
echo " Owner tools: https://$DOMAIN/mail  (and https://$DOMAIN/kafka once you turn Kafka UI on, see deploy/README.md)"
echo "   user: visitante   password: $(cat deploy/.visitor-password)   (keep it private)"
echo " (the HTTPS certificate can take a minute on the first visit)"
echo "=============================================================="

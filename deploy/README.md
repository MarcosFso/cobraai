# Deploy: the microservices version on one server

Runs the whole stack (Java billing service, Node.js notifications, Python reports, React dashboard, PostgreSQL,
Redis, Kafka, Kafka UI, Mailpit) on a single small Linux server, behind HTTPS and a shared login. Built for the
**Oracle Cloud Always Free** Ampere A1 VM (free, no time limit), but it works on any Ubuntu box with 4+ GB of RAM.

```
internet ──443──> Caddy (HTTPS + password) ─┬─> dashboard (nginx)
                                            ├─> /api/billing ──> billing-service ──> PostgreSQL
                                            │                         └─ outbox ──> Kafka ──┬─> notification-service ──> Mailpit
                                            ├─> /api/report  ──> report-service <───────────┘        (SMTP)
                                            ├─> /kafka       ──> Kafka UI                   └──> Redis
                                            └─> /mail        ──> Mailpit
```

Only Caddy is exposed. The databases, Kafka and the services live on the private Docker network.

## Why there is a shared login

This version has no user accounts, so leaving it open would let anyone create and delete data. Caddy puts one
shared login (`visitante` and a password you choose) in front of everything; put it in the README or in the
LinkedIn post so recruiters can get in. The data is wiped and re-seeded every night at 03:30 (Sao Paulo time).

The web version in `web/` has real accounts and a one-click visitor login; use that one as the main link.

## Steps

The detailed, click-by-click guide (Portuguese) is in [GUIA-ORACLE.md](GUIA-ORACLE.md). In short:

1. Create an Oracle Cloud account and an **Ampere A1** instance (Ubuntu 24.04, 2 OCPU / 12 GB).
2. Open ports 80 and 443 in the instance's security list.
3. Create a free name at https://www.duckdns.org pointing to the instance's public IP.
4. On the server: clone the repository and run

   ```bash
   bash deploy/oracle/bootstrap.sh your-name.duckdns.org
   ```

   It installs Docker, opens the firewall, writes `deploy/.env`, builds and starts everything, loads the demo
   data and schedules the nightly reset. At the end it prints the address and the login.

## Useful commands (on the server)

```bash
cd ~/billing-platform
DC="sudo docker compose --env-file deploy/.env -f deploy/docker-compose.prod.yml"
$DC ps                         # what is running
$DC logs -f billing-service    # follow one service
git pull && $DC up -d --build  # update to the latest code
bash deploy/reset-demo.sh      # wipe and re-seed now
```

## Notes

* The overdue job runs every 10 minutes here (once a day in the base configuration) so the seed shows invoices
  becoming overdue, and the events flowing through Kafka, soon after start. It is idempotent.
* JVM heaps are capped (`-Xmx`) so billing, Kafka and Kafka UI fit comfortably in 4 GB.
* `deploy/.env` holds the generated database password and the password hash. It is git-ignored.
* To test it on your own machine: set `SITE_ADDRESS=http://localhost`, `HTTP_PORT=8088` in `deploy/.env` and
  open http://localhost:8088.

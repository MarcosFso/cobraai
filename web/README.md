# Billing Platform: web version

The online version of the project, built to run for free on **Vercel + Supabase**. A React + TypeScript single page
app talks directly to a Postgres database; the business rules and the security live in the database.

## What it does

* Login with e-mail and password. Anyone can **create a company account**; each company only sees its own data.
* A shared **test user** ("Entrar como visitante") opens a demo company with fictional data, limited in size and
  restored every night.
* Customers (CPF/CNPJ validated by check digits, optional WhatsApp number), invoices (issue, pay, cancel),
  automatic overdue status, dashboard with totals, a monthly chart and a status breakdown.
* **Collect on WhatsApp**: a button on each open or overdue invoice opens a WhatsApp chat with a ready-made message
  (friendly before the due date, firmer after). It is a "click to chat" link: free, no API, and the person only
  presses send. Fully automatic sending would need the paid WhatsApp Business API.
* A feed of the e-mails the system would send to customers (simulated: nothing is really sent in this version).
* Light and dark themes, responsive layout (bottom navigation on phones).

## How it is built

```
React + TypeScript (Vercel)  --supabase-js-->  Supabase: Postgres + Auth
                                                  tables (read-only for users, protected by RLS)
                                                  functions = the only way to write (business rules)
                                                  triggers  = events -> simulated e-mails
                                                  pg_cron   = nightly overdue job and demo reset
```

* **Row level security**: every table has a policy that only lets a user read rows of their own organization.
  Users have no `INSERT/UPDATE/DELETE` privilege at all.
* **Business rules in SQL functions** (`create_customer`, `create_invoice`, `pay_invoice`, `cancel_invoice`):
  valid CPF/CNPJ, amount greater than zero, due date not in the past (Sao Paulo calendar day), allowed status
  changes only. `pay_invoice` is a single atomic `UPDATE`, so two simultaneous clicks cannot both pay.
* **Money in cents** (`bigint`), never decimals.
* **Events and e-mails**: every change writes a row in `invoice_events`; a trigger turns it into a row in
  `notifications`, once per event (`event_id` is unique). This is the same idea as the Kafka version in the root of
  the repository, inside Postgres.
* **Tests**: `supabase/tests/rules.test.sql` checks the rules, the tenant isolation (a user cannot read or change
  another company's data) and the demo limits, against a real PostgreSQL 16. It runs in CI.

## Design preview without a database

```bash
cd web && VITE_MOCK=true npm run dev   # whole app on in-memory sample data, same rules as the database
```

The mock exists for design work and for the app smoke test; the production build never sets `VITE_MOCK`.

## Run locally

```bash
cd web
cp .env.example .env.local   # fill in your Supabase URL and anon key
npm ci
npm run dev                   # http://localhost:5174
```

## Set up Supabase (once)

1. Create a project at https://supabase.com (free plan).
2. Open **SQL Editor**, paste the whole `supabase/setup.sql` and click **Run**. It creates the tables, security
   policies, functions, the demo company and the nightly jobs.
3. In **Project Settings → API**, copy the **Project URL** and the **anon / publishable key** into the environment
   variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (locally in `.env.local`, on Vercel in the project
   settings). Both are public by design; never use the `service_role` key in the site.

The test user is `demo@example.com` / `Demo-2026!` (created by the script).

## Deploy on Vercel

Import the repository, set **Root Directory** to `web`, add the two environment variables and deploy. Vercel detects
Vite on its own (`vercel.json` already has the settings and security headers).

## Tests

```bash
cd web && npm test && npm run lint && npm run build        # frontend
docker run -d --name pgtest -e POSTGRES_PASSWORD=pg -p 5433:5432 postgres:16
cd supabase
for f in tests/00_supabase_stub.sql setup.sql tests/rules.test.sql; do
  docker exec -i pgtest psql -U postgres -v ON_ERROR_STOP=1 -q < $f
done
```

## Limits of the free plans

Supabase pauses free projects after about a week without activity (a scheduled GitHub Action pings it every three
days). Auth e-mails use Supabase's built-in sender, which is rate limited: enough for a portfolio, not for production.

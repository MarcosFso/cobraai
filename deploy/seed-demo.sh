#!/usr/bin/env bash
# Fills the running production stack with demo data (customers and invoices in every state), so the first
# visitor sees a living system. Talks to the billing API on the server's loopback port.
#
#   bash deploy/seed-demo.sh
#
# Past due dates are refused by the API (a business rule), so two invoices are created due today and then moved
# into the past with SQL. The overdue job (every 10 minutes in this stack) turns them into OVERDUE and publishes
# the events, which is a good way to watch the whole pipeline work.
set -euo pipefail

cd "$(dirname "$0")/.."
BILLING_URL="${BILLING_URL:-http://127.0.0.1:18080}"
DC="${DC:-docker compose --env-file deploy/.env -f deploy/docker-compose.prod.yml}"

echo "Waiting for the billing service..."
for i in $(seq 1 60); do
  if curl -fs "$BILLING_URL/health" > /dev/null 2>&1; then break; fi
  [ "$i" = 60 ] && { echo "billing-service did not become healthy" >&2; exit 1; }
  sleep 5
done

# The body goes through stdin so accents reach the server byte for byte on any shell
post() {
  if [ -n "${2:-}" ]; then
    printf '%s' "$2" | curl -fsS -X POST "$BILLING_URL$1" -H 'Content-Type: application/json; charset=utf-8' --data-binary @-
  else
    curl -fsS -X POST "$BILLING_URL$1"
  fi
}
id_of() { grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4; }
in_days() { date -d "+$1 days" +%F; }

customer() { post /customers "{\"name\":\"$1\",\"document\":\"$2\",\"email\":\"$3\"}" | id_of; }
invoice() { post /invoices "{\"customerId\":\"$1\",\"description\":\"$2\",\"amountCents\":$3,\"dueDate\":\"$4\"}" | id_of; }

echo "Creating customers..."
PADARIA=$(customer "Padaria Pão Quente Ltda" "11222333000181" "financeiro@paoquente.example")
CLINICA=$(customer "Clínica Bem Viver" "11444777000161" "contas@bemviver.example")
ANA=$(customer "Ana Souza" "52998224725" "ana.souza@example.com")
OFICINA=$(customer "Oficina Mecânica Irmãos Lima" "45723174000110" "pagamentos@oficinalima.example")
CARLOS=$(customer "Carlos Pereira" "11144477735" "carlos.pereira@example.com")
MARIANA=$(customer "Mariana Costa" "39053344705" "mariana.costa@example.com")

echo "Creating invoices..."
P1=$(invoice "$PADARIA" "Honorários de outubro" 150000 "$(in_days 3)")
P2=$(invoice "$CLINICA" "Mensalidade de outubro" 89000 "$(in_days 5)")
P3=$(invoice "$ANA" "Consultoria contábil" 42000 "$(in_days 6)")
P4=$(invoice "$MARIANA" "Honorários de outubro" 60000 "$(in_days 7)")
invoice "$PADARIA" "Honorários de novembro" 150000 "$(in_days 12)" > /dev/null
invoice "$CLINICA" "Mensalidade de novembro" 89000 "$(in_days 18)" > /dev/null
invoice "$ANA" "Planejamento tributário" 135000 "$(in_days 25)" > /dev/null
invoice "$MARIANA" "Honorários de novembro" 60000 "$(in_days 20)" > /dev/null
C1=$(invoice "$OFICINA" "Contrato cancelado" 45000 "$(in_days 7)")
invoice "$ANA" "Balanço trimestral" 98000 "$(in_days 0)" > /dev/null
invoice "$OFICINA" "Folha de pagamento" 54000 "$(in_days 0)" > /dev/null
invoice "$CARLOS" "Regularização fiscal" 76000 "$(in_days 0)" > /dev/null

echo "Paying and canceling a few..."
for id in "$P1" "$P2" "$P3" "$P4"; do post "/invoices/$id/pay" > /dev/null; done
post "/invoices/$C1/cancel" > /dev/null

echo "Moving three invoices into the past (they become OVERDUE within 10 minutes)..."
$DC exec -T postgres psql -U billing -d billing -q -c "
  update invoices set due_date = current_date - 15, created_at = created_at - interval '25 days' where description = 'Balanço trimestral';
  update invoices set due_date = current_date - 8,  created_at = created_at - interval '18 days' where description = 'Folha de pagamento';
  update invoices set due_date = current_date - 3,  created_at = created_at - interval '12 days' where description = 'Regularização fiscal';"

echo "Demo data ready."

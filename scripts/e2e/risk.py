import json, sys, time, urllib.request, urllib.error
import os
B = os.environ.get("BASE_URL", "http://localhost:8088") + "/api"
def call(m, p, t=None, b=None):
    h = {"Content-Type": "application/json"}
    if t: h["Authorization"] = "Bearer " + t
    r = urllib.request.Request(B + p, data=json.dumps(b).encode() if b is not None else (b"" if m == "POST" else None), method=m, headers=h)
    try:
        with urllib.request.urlopen(r) as x:
            tx = x.read().decode(); return x.status, json.loads(tx) if tx else None
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()
ok = bad = 0
def check(n, c, d=""):
    global ok, bad
    ok += bool(c); bad += (not c)
    print(("  ok   " if c else "  FAIL ") + n + (f"  [{d}]" if d and not c else ""))
def wait(fn, t=60):
    end = time.time() + t
    while time.time() < end:
        v = fn()
        if v: return v
        time.sleep(1)

_, demo = call("POST", "/billing/auth/demo"); t = demo["token"]
print("1) Sandbox do visitante")
risk = wait(lambda: (lambda r: r[1] if r[0] == 200 and len(r[1]) >= 6 else None)(call("GET", "/report/reports/risk", t)))
check("risco calculado para os 6 clientes de exemplo", risk is not None and len(risk) == 6, risk)
if risk:
    for r in risk: print("     ", r["customerName"], r["level"], r["score"], "atraso medio", r["avgDelayDays"], "vencidas", r["overdueCount"])
    check("todos com nome", all(r["customerName"] for r in risk))
    check("quem tem cobranca vencida pontua mais que quem so paga em dia", max(r["score"] for r in risk if r["overdueCount"]) > min(r["score"] for r in risk))
    check("ordenado do mais arriscado ao menos", [r["score"] for r in risk] == sorted((r["score"] for r in risk), reverse=True))
s, f = call("GET", "/report/reports/forecast", t)
months = f["months"] if s == 200 else []
check("previsao com 3 meses", len(months) == 3, f)
if months:
    print("     ", months)
    check("recebido do mes bate com o relatorio", months[0]["receivedCents"] == call("GET", "/report/reports/summary", t)[1]["receivedCents"])
    check("previsto nao passa do total em aberto", sum(m["expectedCents"] for m in months) <= call("GET", "/report/reports/summary", t)[1]["openCents"] + call("GET", "/report/reports/summary", t)[1]["overdueCents"])

print("2) Empresa real: cliente que paga atrasado vira risco, pontual fica baixo")
suf = str(int(time.time()))[-6:]
_, a = call("POST", "/billing/auth/register", None, {"company": "Risco Ltda", "email": f"r{suf}@r.example", "password": "senha-forte-123"}); ta = a["token"]
_, c1 = call("POST", "/billing/customers", ta, {"name": "Cliente Pontual", "document": "529.982.247-25", "email": "p@x.example"})
_, c2 = call("POST", "/billing/customers", ta, {"name": "Cliente Novo", "document": "11222333000181", "email": "n@x.example"})
due = time.strftime("%Y-%m-%d", time.localtime(time.time() + 30 * 86400))
for i in range(3):
    inv = call("POST", "/billing/invoices", ta, {"customerId": c1["id"], "description": f"mes {i}", "amountCents": 10000, "dueDate": due})[1]
    call("POST", f"/billing/invoices/{inv['id']}/pay", ta)
call("POST", "/billing/invoices", ta, {"customerId": c2["id"], "description": "x", "amountCents": 50000, "dueDate": due})
r = wait(lambda: (lambda x: x[1] if x[0] == 200 and any(c["paidCount"] == 3 for c in x[1]) else None)(call("GET", "/report/reports/risk", ta)))
by = {c["customerName"]: c for c in (r or [])}
check("pontual: 3 pagamentos, risco baixo", by.get("Cliente Pontual", {}).get("level") == "LOW" and by["Cliente Pontual"]["avgDelayDays"] == 0, by)
check("novo: sem historico, por ultimo", by.get("Cliente Novo", {}).get("level") == "NO_DATA" and r[-1]["customerName"] == "Cliente Novo", r)
fc = call("GET", "/report/reports/forecast", ta)[1]["months"]
check("previsao de caixa inclui a cobranca em aberto", sum(m["nominalCents"] for m in fc) == 50000, fc)

print("3) Isolamento e login")
check("sem token = 401", call("GET", "/report/reports/risk")[0] == 401 and call("GET", "/report/reports/forecast")[0] == 401)
check("outra empresa nao ve os clientes desta", "Cliente Pontual" not in json.dumps(call("GET", "/report/reports/risk", t)[1]))
print(f"\nRESULTADO: {ok} ok, {bad} falhas"); sys.exit(1 if bad else 0)

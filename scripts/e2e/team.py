import base64, json, sys, time, urllib.error, urllib.request, uuid

import os
BASE = os.environ.get("BASE_URL", "http://localhost:8088")
OK, BAD = [], []


def call(method, path, token=None, body=None):
    headers = {"Content-Type": "application/json"} if body is not None else {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if body is not None else (b"" if method in ("POST", "PUT") else None)
    req = urllib.request.Request(BASE + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req) as r:
            text = r.read().decode()
            return r.status, (json.loads(text) if text else None)
    except urllib.error.HTTPError as e:
        text = e.read().decode()
        try:
            return e.code, json.loads(text)
        except ValueError:
            return e.code, text


def check(name, cond, detail=""):
    (OK if cond else BAD).append(name)
    print(("  ok   " if cond else "  FAIL ") + name + (f"  [{detail}]" if detail and not cond else ""))


def wait_for(fn, timeout=40):
    end = time.time() + timeout
    while time.time() < end:
        v = fn()
        if v:
            return v
        time.sleep(1)
    return None


sfx = uuid.uuid4().hex[:6]
print("1) Empresa cria conta; funcionario cria conta SEM empresa")
_, admin = call("POST", "/api/billing/auth/register", body={"company": "Empresa Equipe", "email": f"dono-{sfx}@e.example", "password": "senha-forte-123"})
check("dono e ADMIN", admin["role"] == "ADMIN" and admin["pending"] is False)
mail = f"func-{sfx}@e.example"
s, waiting = call("POST", "/api/billing/auth/register", body={"email": mail, "password": "senha-forte-123"})
check("conta sem empresa fica pendente", s == 201 and waiting["pending"] is True and waiting.get("company") is None, waiting)
wt = waiting["token"]
at = admin["token"]

due = time.strftime("%Y-%m-%d", time.localtime(time.time() + 12 * 86400))
_, cust = call("POST", "/api/billing/customers", at, {"name": "Cliente da Equipe", "document": "529.982.247-25", "email": f"c-{sfx}@c.example", "phone": "11987654321"})
_, inv = call("POST", "/api/billing/invoices", at, {"customerId": cust["id"], "description": "Cobranca unica", "amountCents": 100000, "dueDate": due})

print("2) Pendente nao enxerga nada em NENHUM dos 3 servicos")
for path in ("/api/billing/customers", "/api/billing/invoices", "/api/billing/team", "/api/report/reports/summary", "/api/notification/notifications"):
    check(f"401 pendente em {path}", call("GET", path, wt)[0] == 401)
check("/auth/me do pendente funciona", call("GET", "/api/billing/auth/me", wt)[1]["pending"] is True)

print("3) Administrador libera o e-mail")
check("funcionario nao pode se auto-adicionar", call("POST", "/api/billing/team", wt, {"email": mail})[0] == 401)
check("e-mail inexistente = 404", call("POST", "/api/billing/team", at, {"email": "ninguem@x.example"})[0] == 404)
s, added = call("POST", "/api/billing/team", at, {"email": mail.upper()})
check("admin adiciona (e-mail case-insensitive)", s == 201 and added["role"] == "MEMBER", added)
check("token antigo continua sem acesso", call("GET", "/api/billing/customers", wt)[0] == 401)
_, me = call("GET", "/api/billing/auth/me", wt)
check("/auth/me entrega token novo", me.get("token") and me["pending"] is False and me["role"] == "MEMBER", me)
mt = me["token"]
check("funcionario ve os clientes da empresa", [c["name"] for c in call("GET", "/api/billing/customers", mt)[1]] == ["Cliente da Equipe"])
check("funcionario ve as cobrancas", len(call("GET", "/api/billing/invoices", mt)[1]) == 1)
check("funcionario ve os relatorios (Python)", wait_for(lambda: (lambda r: r if r[0] == 200 and r[1].get("openCents") == 100000 else None)(call("GET", "/api/report/reports/summary", mt))) is not None)
check("funcionario ve os avisos (Node)", wait_for(lambda: (lambda r: r if r[0] == 200 and len(r[1]) >= 1 else None)(call("GET", "/api/notification/notifications", mt))) is not None)
check("funcionario emite cobranca", call("POST", "/api/billing/invoices", mt, {"customerId": cust["id"], "description": "Do funcionario", "amountCents": 5000, "dueDate": due})[0] == 201)
check("funcionario NAO gerencia equipe (403)", call("POST", "/api/billing/team", mt, {"email": "x@y.example"})[0] == 403)
check("funcionario ve a lista da equipe", len(call("GET", "/api/billing/team", mt)[1]) == 2)

print("4) Cobranca recorrente")
s, first = call("POST", "/api/billing/recurring", mt, {"customerId": cust["id"], "description": "Honorarios mensais", "amountCents": 150000, "firstDueDate": due})
check("primeira cobranca emitida na hora, marcada como mensal", s == 201 and first["recurring"] is True, first)
_, rec = call("GET", "/api/billing/recurring", at)
check("admin ve a recorrencia do funcionario", len(rec) == 1 and rec[0]["active"] and rec[0]["amountCents"] == 150000, rec)
check("o relatorio incluiu a cobranca mensal", wait_for(lambda: (lambda r: r if r[1].get("openCents") == 100000 + 5000 + 150000 else None)(call("GET", "/api/report/reports/summary", at))) is not None)
check("parar a recorrencia", call("POST", f"/api/billing/recurring/{rec[0]['id']}/stop", at)[1]["active"] is False)

print("5) Outra empresa nao ve equipe nem recorrencia")
_, other = call("POST", "/api/billing/auth/register", body={"company": "Outra", "email": f"o-{sfx}@o.example", "password": "senha-forte-123"})
ot = other["token"]
check("outra empresa ve so a si mesma na equipe", len(call("GET", "/api/billing/team", ot)[1]) == 1)
check("outra empresa nao ve recorrencias", call("GET", "/api/billing/recurring", ot)[1] == [])
check("outra empresa nao para a recorrencia (404)", call("POST", f"/api/billing/recurring/{rec[0]['id']}/stop", ot)[0] == 404)
member_id = next(m["id"] for m in call("GET", "/api/billing/team", at)[1] if m["email"] == mail)
check("outra empresa nao remove o funcionario (404)", call("DELETE", f"/api/billing/team/{member_id}", ot)[0] == 404)

print("6) Remocao corta o acesso na hora (billing); relatorio/avisos so no fim do token")
check("admin remove o funcionario", call("DELETE", f"/api/billing/team/{member_id}", at)[0] == 204)
check("mesmo token: billing recusa na hora", call("GET", "/api/billing/customers", mt)[0] == 401 and call("GET", "/api/billing/invoices", mt)[0] == 401)
_, me2 = call("GET", "/api/billing/auth/me", mt)
check("conta volta a pendente", me2["pending"] is True and me2.get("token"))
check("novo token da conta pendente nao abre os 3 servicos", all(call("GET", p, me2["token"])[0] == 401 for p in ("/api/billing/customers", "/api/report/reports/summary", "/api/notification/notifications")))
s, relog = call("POST", "/api/billing/auth/login", body={"email": mail, "password": "senha-forte-123"})
check("login do removido = pendente", s == 200 and relog["pending"] is True)

print("7) Visitante nao tem equipe")
_, demo = call("POST", "/api/billing/auth/demo")
check("visitante ve a recorrencia de exemplo", len(call("GET", "/api/billing/recurring", demo["token"])[1]) == 1)
check("visitante nao adiciona equipe (400)", call("POST", "/api/billing/team", demo["token"], {"email": mail})[0] == 400)

print(f"\nRESULTADO: {len(OK)} ok, {len(BAD)} falhas")
sys.exit(1 if BAD else 0)

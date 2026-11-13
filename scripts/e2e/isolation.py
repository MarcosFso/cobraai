import base64, hashlib, hmac, json, sys, time, urllib.error, urllib.request, uuid

import os
BASE = os.environ.get("BASE_URL", "http://localhost:8088")
ORIGIN = BASE
OK, BAD = [], []


def call(method, path, token=None, body=None, auth=None):
    headers = {"Content-Type": "application/json"} if body is not None else {}
    headers["Origin"] = ORIGIN  # like a browser: same-origin POSTs carry it
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if auth:
        headers["Authorization"] = "Basic " + base64.b64encode(auth.encode()).decode()
    data = json.dumps(body).encode() if body is not None else (b"" if method == "POST" else None)
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


def check(name, condition, detail=""):
    (OK if condition else BAD).append(name)
    print(("  ok   " if condition else "  FAIL ") + name + (f"  [{detail}]" if detail and not condition else ""))


def wait_for(fn, timeout=40):
    end = time.time() + timeout
    while time.time() < end:
        value = fn()
        if value:
            return value
        time.sleep(1)
    return None


print("1) Sem login, nada abre")
for path in ("/api/billing/customers", "/api/billing/invoices", "/api/report/reports/summary", "/api/notification/notifications"):
    check(f"401 sem token em {path}", call("GET", path)[0] == 401)
check("health continua publico", call("GET", "/api/billing/health")[0] == 200)

print("2) Duas empresas se cadastram")
suffix = uuid.uuid4().hex[:6]
sa, ra = call("POST", "/api/billing/auth/register", body={"company": "Empresa Alfa", "email": f"alfa-{suffix}@a.example", "password": "senha-forte-123"})
sb, rb = call("POST", "/api/billing/auth/register", body={"company": "Empresa Beta", "email": f"beta-{suffix}@b.example", "password": "senha-forte-123"})
check("cadastro A e B", sa == 201 and sb == 201)
ta, tb = ra["token"], rb["token"]

print("3) Cada uma cria dados (o mesmo CPF nas duas)")
_, cust_a = call("POST", "/api/billing/customers", ta, {"name": "Cliente da Alfa", "document": "529.982.247-25", "email": f"cli-{suffix}@alfa.example", "phone": "(11) 91234-5678"})
_, cust_b = call("POST", "/api/billing/customers", tb, {"name": "Cliente da Beta", "document": "529.982.247-25", "email": f"cli-{suffix}@beta.example", "phone": "(21) 98888-7777"})
check("mesmo CPF aceito nas duas empresas", cust_a.get("id") and cust_b.get("id"))
check("telefone normalizado com +55", cust_a.get("phone") == "5511912345678", cust_a.get("phone"))
due = time.strftime("%Y-%m-%d", time.localtime(time.time() + 15 * 86400))
_, inv_a = call("POST", "/api/billing/invoices", ta, {"customerId": cust_a["id"], "description": "Cobranca da Alfa", "amountCents": 111100, "dueDate": due})
_, inv_b1 = call("POST", "/api/billing/invoices", tb, {"customerId": cust_b["id"], "description": "Cobranca da Beta 1", "amountCents": 222200, "dueDate": due})
_, inv_b2 = call("POST", "/api/billing/invoices", tb, {"customerId": cust_b["id"], "description": "Cobranca da Beta 2", "amountCents": 333300, "dueDate": due})
call("POST", f"/api/billing/invoices/{inv_b1['id']}/pay", tb)
check("fatura traz nome e telefone do cliente", inv_a.get("customerName") == "Cliente da Alfa" and inv_a.get("customerPhone") == "5511912345678")

print("4) Billing: uma empresa nao enxerga nem mexe na outra")
check("A lista so as suas faturas", [i["description"] for i in call("GET", "/api/billing/invoices", ta)[1]] == ["Cobranca da Alfa"])
check("B lista so as suas", sorted(i["description"] for i in call("GET", "/api/billing/invoices", tb)[1]) == ["Cobranca da Beta 1", "Cobranca da Beta 2"])
check("B nao le a fatura de A (404)", call("GET", f"/api/billing/invoices/{inv_a['id']}", tb)[0] == 404)
check("B nao paga a fatura de A (404)", call("POST", f"/api/billing/invoices/{inv_a['id']}/pay", tb)[0] == 404)
check("B nao cancela a fatura de A (404)", call("POST", f"/api/billing/invoices/{inv_a['id']}/cancel", tb)[0] == 404)
check("B nao le o cliente de A (404)", call("GET", f"/api/billing/customers/{cust_a['id']}", tb)[0] == 404)
check("B nao emite fatura no cliente de A (404)", call("POST", "/api/billing/invoices", tb, {"customerId": cust_a["id"], "description": "x", "amountCents": 100, "dueDate": due})[0] == 404)
check("fatura de A segue aberta", call("GET", f"/api/billing/invoices/{inv_a['id']}", ta)[1]["status"] == "OPEN")

print("5) Kafka -> relatorios (Python): numeros separados por empresa")
sum_a = wait_for(lambda: (lambda s: s if s[1].get("openCents") == 111100 else None)(call("GET", "/api/report/reports/summary", ta)))
sum_b = wait_for(lambda: (lambda s: s if s[1].get("receivedCents") == 222200 else None)(call("GET", "/api/report/reports/summary", tb)))
check("A: aberto 1.111,00 e recebido 0", sum_a and sum_a[1]["openCents"] == 111100 and sum_a[1]["receivedCents"] == 0, sum_a)
check("B: aberto 3.333,00 e recebido 2.222,00", sum_b and sum_b[1]["openCents"] == 333300 and sum_b[1]["receivedCents"] == 222200, sum_b)

print("6) Kafka -> avisos (Node): historico separado por empresa")
na = wait_for(lambda: (lambda r: r[1] if r[0] == 200 and len(r[1]) >= 1 else None)(call("GET", "/api/notification/notifications", ta)))
nb = wait_for(lambda: (lambda r: r[1] if r[0] == 200 and len(r[1]) >= 3 else None)(call("GET", "/api/notification/notifications", tb)))
check("A so ve avisos para o cliente dela", na and all(n["to"].endswith("@alfa.example") for n in na), na)
check("B so ve avisos para o cliente dela", nb and all(n["to"].endswith("@beta.example") for n in nb), nb)

print("7) Tokens falsos nao passam em nenhum dos 3 servicos")


def b64(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


header, payload, _ = ta.split(".")
claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
claims["org"] = json.loads(base64.urlsafe_b64decode(tb.split(".")[1] + "=" * (-len(tb.split(".")[1]) % 4)))["org"]
forged_payload = b64(json.dumps(claims).encode())
forged = f"{header}.{forged_payload}.{tb.split('.')[2]}"
wrong_secret = f"{header}.{payload}." + b64(hmac.new(b"outro-segredo-qualquer-que-nao-confere", f"{header}.{payload}".encode(), hashlib.sha256).digest())
for label, tok in (("token adulterado (troca de empresa)", forged), ("assinado com outro segredo", wrong_secret), ("lixo", "abc.def.ghi")):
    for path in ("/api/billing/customers", "/api/report/reports/summary", "/api/notification/notifications"):
        check(f"401: {label} em {path.split('/')[2]}", call("GET", path, tok)[0] == 401)

print("8) Login e senha")
check("senha errada = 401", call("POST", "/api/billing/auth/login", body={"email": f"alfa-{suffix}@a.example", "password": "errada-errada"})[0] == 401)
check("e-mail inexistente = 401 (mesma resposta)", call("POST", "/api/billing/auth/login", body={"email": "ninguem@x.example", "password": "errada-errada"})[0] == 401)
check("login correto", call("POST", "/api/billing/auth/login", body={"email": f"ALFA-{suffix}@a.example", "password": "senha-forte-123"})[0] == 200)
check("e-mail repetido = 409", call("POST", "/api/billing/auth/register", body={"company": "X", "email": f"alfa-{suffix}@a.example", "password": "senha-forte-123"})[0] == 409)

print("9) Visitante: sandbox propria, com dados de exemplo, sem disparar e-mails")
_, mail_before = call("GET", "/mail/api/v1/messages", auth="" + os.environ.get("OWNER_AUTH", "visitante:teste123") + "")
sd, demo1 = call("POST", "/api/billing/auth/demo")
_, demo2 = call("POST", "/api/billing/auth/demo")
check("visitante entra sem cadastro", sd == 201 and demo1["demo"] is True)
check("sandbox tem 6 clientes e 23 cobrancas", len(call("GET", "/api/billing/customers", demo1["token"])[1]) == 6 and len(call("GET", "/api/billing/invoices", demo1["token"])[1]) == 23)
check("telefones de exemplo para o WhatsApp", all(c["phone"] for c in call("GET", "/api/billing/customers", demo1["token"])[1]))
call("POST", "/api/billing/customers", demo1["token"], {"name": "So neste", "document": "12.345.678/0001-95", "email": "a@b.example"})
check("mudanca num visitante nao aparece no outro", len(call("GET", "/api/billing/customers", demo2["token"])[1]) == 6)
rep = wait_for(lambda: (lambda s: s if s[1].get("overdueCents") == 228000 else None)(call("GET", "/api/report/reports/summary", demo1["token"])), 60)
check("relatorio do visitante: R$ 2.280,00 atrasados (3 cobrancas)", rep is not None, rep)
check("relatorio do visitante mostra pagamentos deste mes", rep and rep[1]["receivedCents"] == 210000, rep)
monthly = call("GET", f"/api/report/reports/monthly?year={time.localtime().tm_year}", demo1["token"])[1]
check("grafico mensal com historico de varios meses", sum(1 for m in monthly if m["issuedCents"] > 0) >= 6, monthly)
hist = wait_for(lambda: (lambda r: r[1] if r[0] == 200 and len(r[1]) >= 30 else None)(call("GET", "/api/notification/notifications", demo1["token"])), 60)
check("historico de avisos do visitante foi gravado", hist is not None)
time.sleep(3)
_, mail_after = call("GET", "/mail/api/v1/messages", auth="" + os.environ.get("OWNER_AUTH", "visitante:teste123") + "")
if isinstance(mail_before, dict) and isinstance(mail_after, dict):
    check("dados de exemplo nao enviam e-mail (caixa de e-mail igual)", mail_after["total"] == mail_before["total"], (mail_before["total"], mail_after["total"]))
else:
    print("  (pulado: sem a senha do dono em OWNER_AUTH, a caixa de e-mail nao pode ser lida)")
check("A (empresa real) nao ve nada do visitante", len(call("GET", "/api/billing/customers", ta)[1]) == 1)

print("9b) Ordem dos eventos: 5 sandboxes criadas em rajada, todas com os totais exatos")
sandboxes = [call("POST", "/api/billing/auth/demo")[1]["token"] for _ in range(5)]
for n, tok in enumerate(sandboxes, 1):
    got = wait_for(lambda: (lambda s: s if s[1].get("overdueCents") == 228000 and s[1].get("openCents") == 434000 else None)(call("GET", "/api/report/reports/summary", tok)), 60)
    check(f"sandbox {n}: aberto 4.340,00 / atrasado 2.280,00 / recebido 2.100,00", got is not None and got[1]["receivedCents"] == 210000, call("GET", "/api/report/reports/summary", tok)[1])

print("10) Ferramentas do dono")
check("/kafka pede senha", call("GET", "/kafka/")[0] == 401)
check("/mail pede senha", call("GET", "/mail/")[0] == 401)
if "OWNER_AUTH" in os.environ:
    check("/mail abre com a senha do dono", call("GET", "/mail/api/v1/messages", auth=os.environ["OWNER_AUTH"])[0] == 200)

print(f"\nRESULTADO: {len(OK)} ok, {len(BAD)} falhas")
sys.exit(1 if BAD else 0)

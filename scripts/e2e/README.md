# Testes de ponta a ponta

Scripts em Python (só biblioteca padrão) que rodam contra o sistema inteiro já no ar: Java, Kafka, Python, Node e
o site. Servem para provar que o isolamento entre empresas, a equipe, as cobranças mensais, o risco e a previsão
funcionam juntos, e não só em cada serviço.

```bash
BASE_URL=http://localhost:8088 python scripts/e2e/isolation.py   # empresas separadas, tokens falsos, visitante
BASE_URL=http://localhost:8088 python scripts/e2e/team.py        # equipe, papéis, remoção, cobranças mensais
BASE_URL=http://localhost:8088 python scripts/e2e/risk.py        # score de risco e previsão de caixa
```

`isolation.py` também confere as ferramentas do dono (`/mail`): passe `OWNER_AUTH=usuario:senha` se a senha não for a de teste.
Cada script termina com `RESULTADO: N ok, M falhas` e código de saída diferente de zero se algo falhar.

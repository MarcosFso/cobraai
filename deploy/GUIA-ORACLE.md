# Guia: colocar a versão Java + Docker + Kafka no ar (Oracle Cloud grátis)

Resultado: um endereço como `https://seunome.duckdns.org`, ligado 24 horas, com HTTPS e uma senha de visitante.
Custo: zero (plano "Always Free" da Oracle). Tempo: cerca de 40 minutos na primeira vez.

## Parte 1: conta na Oracle

1. Entre em https://www.oracle.com/br/cloud/free/ e crie a conta. Ela pede um cartão só para confirmar que você
   é uma pessoa real. O plano gratuito não cobra.
2. Em **Home Region**, escolha **Brazil Southeast (Vinhedo)** ou **Brazil East (São Paulo)**. Depois de criada,
   a região não muda.

## Parte 2: criar o servidor

1. No painel da Oracle: menu ☰ → **Compute** → **Instances** → **Create instance**.
2. **Name**: `billing`.
3. **Image and shape** → **Edit**:
   * **Image**: clique em *Change image* e escolha **Canonical Ubuntu 24.04**.
   * **Shape**: *Change shape* → **Ampere** → **VM.Standard.A1.Flex**, com **2 OCPUs** e **12 GB** de memória.
     (O plano grátis permite até 4 OCPUs e 24 GB no total. 12 GB sobra.)
4. **Networking**: deixe a opção de criar uma rede nova e confirme **Assign a public IPv4 address**.
5. **Add SSH keys**: escolha **Generate a key pair for me** e clique em **Save private key**. Guarde esse arquivo
   (`.key`) em um lugar seguro, por exemplo `C:\Users\mfilh\.ssh\oracle.key`. Sem ele você não entra no servidor.
6. Clique em **Create**. Se aparecer **"Out of host capacity"**, é falta de vaga da Oracle naquele momento: tente de
   novo em algumas horas (ou outro dia). É comum e não é erro seu.
7. Quando o estado ficar **Running**, anote o **Public IP address** da instância.

## Parte 3: abrir as portas 80 e 443

1. Na página da instância, clique no nome da **Subnet** → clique na **Default Security List**.
2. **Add Ingress Rules** e crie duas regras:
   * Source CIDR `0.0.0.0/0`, IP Protocol **TCP**, Destination Port Range `80`.
   * Source CIDR `0.0.0.0/0`, IP Protocol **TCP**, Destination Port Range `443`.

## Parte 4: um endereço grátis (DuckDNS)

1. Entre em https://www.duckdns.org (login com GitHub ou Google).
2. Em **domains**, digite um nome (por exemplo `marcos-cobrancas`), clique em **add domain**.
3. No campo **current ip**, cole o IP público da Oracle e clique em **update ip**.
4. Seu endereço será `marcos-cobrancas.duckdns.org`.

## Parte 5: instalar (um comando)

No seu PC, abra o PowerShell e entre no servidor (troque o IP e o caminho da chave):

```powershell
icacls C:\Users\mfilh\.ssh\oracle.key /inheritance:r /grant:r "$($env:USERNAME):(R)"
ssh -i C:\Users\mfilh\.ssh\oracle.key ubuntu@IP-DA-ORACLE
```

(O `icacls` só ajusta a permissão do arquivo da chave, que o SSH do Windows exige. Rode uma vez.)

Já dentro do servidor:

```bash
sudo apt-get update && sudo apt-get install -y git gh
gh auth login            # GitHub.com → HTTPS → "Login with a web browser": abra o link, digite o código
gh repo clone MarcosFso/billing-platform
cd billing-platform
bash deploy/oracle/bootstrap.sh marcos-cobrancas.duckdns.org
```

A primeira instalação demora uns 15 minutos (compila o Java e baixa as imagens). No final aparecem o endereço e a
senha do visitante. **Anote a senha.** Se quiser escolher a sua, rode com ela no fim:
`bash deploy/oracle/bootstrap.sh marcos-cobrancas.duckdns.org MinhaSenha123`.

Se o repositório já for público, em vez do `gh` basta `git clone https://github.com/MarcosFso/billing-platform.git`.

## Parte 6: conferir

Abra `https://marcos-cobrancas.duckdns.org` (na primeira visita o certificado leva cerca de 1 minuto). Entre com
`visitante` e a senha. Você deve ver o painel com dados de exemplo. Em até 10 minutos três cobranças passam a
"vencidas" sozinhas: é a rotina do Java publicando eventos no Kafka. Para ver as mensagens:

* `https://marcos-cobrancas.duckdns.org/kafka`: mensagens e tópicos do Kafka.
* `https://marcos-cobrancas.duckdns.org/mail`: e-mails que o serviço Node.js enviou.

## No dia a dia

```bash
ssh -i C:\Users\mfilh\.ssh\oracle.key ubuntu@IP     # entrar
cd billing-platform
DC="sudo docker compose --env-file deploy/.env -f deploy/docker-compose.prod.yml"
$DC ps                          # o que está rodando
$DC logs -f billing-service     # ver o log de um serviço
git pull && $DC up -d --build   # atualizar para o código mais novo
```

Os dados são apagados e recriados toda madrugada (03:30). Para refazer na hora: `bash deploy/reset-demo.sh`.

## Cuidados

* **Não desligue nem apague a instância.** Se ficar muito parada (quase sem uso por vários dias), a Oracle pode
  recolher recursos gratuitos ociosos. Esta pilha usa bastante memória, o que ajuda a evitar isso, mas visite o
  endereço de vez em quando.
* Guarde o arquivo `.key`: ele é a única chave do servidor.
* Quem tiver a senha do visitante vê e altera os dados da demonstração. Não use dados reais.

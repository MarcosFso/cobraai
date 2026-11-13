# Guia: a versão Java + Kafka no Azure (conta de estudante)

Esta é a instalação que está no ar: `https://marcos-cobrancas.chilecentral.cloudapp.azure.com`.

## O que existe no Azure
| Item | Valor |
|---|---|
| Máquina | `billing`, tamanho **B2als_v2** (2 vCPU, 4 GB), Ubuntu 24.04, **Chile Central** |
| Disco | SSD padrão, 30 GB (apagado junto com a máquina) |
| IP público | `billing-ip`, **fixo**, com o nome DNS `marcos-cobrancas.chilecentral.cloudapp.azure.com` |
| Portas abertas | 22 (SSH), 80 e 443 (site) |
| Grupo de recursos | `billing_group` |
| Custo | cerca de US$ 0,0526 por hora (US$ 38 por mês) mais disco e IP: uns US$ 45 por mês |

## Por que essa máquina e essa região
O plano **Azure for Students** só permite criar recursos em 5 regiões (Brazil South, Belgium Central, Canada Central,
North Central US e Chile Central) e bloqueia a maioria dos tamanhos de máquina (`NotAvailableForSubscription`). Em Chile
Central, a única máquina de 4 GB liberada foi a B2als_v2. Se a lista ficar vazia, confira a **Zona de disponibilidade**:
deixe em "Nenhuma redundância de infraestrutura necessária".

## Entrar na máquina
```powershell
ssh -i $env:USERPROFILE\.ssh\billing_key.pem azureuser@<IP-PUBLICO-DA-MAQUINA>
```
A chave `billing_key.pem` só existe no seu computador: o Azure não guarda cópia. Faça uma cópia de segurança dela.

## Comandos do dia a dia (dentro da máquina)
```bash
cd ~/billing-platform
DC="sudo docker compose --env-file deploy/.env -f deploy/docker-compose.prod.yml"
$DC ps                      # o que está rodando
$DC logs -f billing-service # ver o log de um serviço
```
A senha das ferramentas do dono (`/mail` e `/kafka`) está em `~/billing-platform/deploy/.visitor-password`.

## Parar para economizar crédito
- **Pelo portal:** abra a máquina `billing` e clique em **Parar**. A máquina fica **desalocada** (sem cobrança de
  computação, só do disco e do IP fixo, uns US$ 5 por mês). **Iniciar** traz tudo de volta em 2 a 3 minutos, com o
  mesmo endereço e os mesmos dados.
- **Nunca** desligue só com `shutdown` dentro do Linux: isso **não** para a cobrança.
- **Sozinha, por inatividade:** `deploy/azure/idle-shutdown.sh` roda a cada 10 minutos (cron) e desaloca a máquina se
  ninguém usar o site por 3 horas (conta pedidos a `/api`, `/mail` e `/kafka`; o `/health` e a página inicial não contam,
  porque robôs da internet os visitam o dia todo). Ele nunca desliga nas primeiras 3 horas depois de ligar.
  Para isso a máquina precisa da identidade gerenciada ligada e do papel **Colaborador da Máquina Virtual** no grupo de
  recursos `billing_group` (portal: máquina → Identidade → Atribuições de função do Azure → Adicionar).
  Sem o papel, o script só escreve no log (`/var/log/idle-shutdown.log`) e não faz nada.
  - Mudar o tempo: `IDLE_HOURS=6 bash deploy/azure/enable-idle-shutdown.sh`.
  - Desligar o recurso: `sudo rm /etc/cron.d/idle-shutdown`.
  - Ver o que ele faria agora, sem parar nada: `DRY_RUN=1 bash deploy/azure/idle-shutdown.sh`.

## Atualizar o código
O repositório é privado, então o código foi enviado do computador para a máquina:
```powershell
cd <pasta-do-projeto>
git archive --format=tar.gz -o $env:TEMP\bp.tgz HEAD
scp -i $env:USERPROFILE\.ssh\billing_key.pem $env:TEMP\bp.tgz azureuser@<IP-PUBLICO-DA-MAQUINA>:/home/azureuser/bp.tgz
ssh -i $env:USERPROFILE\.ssh\billing_key.pem azureuser@<IP-PUBLICO-DA-MAQUINA> "tar -xzf ~/bp.tgz -C ~/billing-platform && cd ~/billing-platform && sudo docker compose --env-file deploy/.env -f deploy/docker-compose.prod.yml up -d --build"
```

## Alerta de gasto
No portal: **Gerenciamento de custos → Orçamentos**, e crie um de US$ 80 com aviso por e-mail.

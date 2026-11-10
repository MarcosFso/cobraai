# Guia de uso, passo a passo (com imagens)

Este guia mostra o sistema como o usuário vê, tela por tela. As imagens são da versão com Java, Kafka, Python e
Node.js, mas o site é o mesmo na versão do Vercel e Supabase.

## 1. Entrar

![Tela de login](screenshots/01-login.jpg)

Há três caminhos:

* **Entrar como visitante** (botão azul-claro): cria uma empresa de exemplo só sua, com dados fictícios, sem cadastro.
  Serve para conhecer o sistema. Ela é apagada depois de 24 horas.
* **Criar conta**: cadastra a sua empresa com e-mail e senha (mínimo de 8 caracteres). Cada empresa vê apenas os
  próprios dados.
* **Entrar**: para quem já tem conta.

### Criar a conta da sua empresa

![Criar conta](screenshots/09-criar-conta.jpg)

Preencha o nome da empresa, o e-mail e uma senha, e clique em **Criar conta da empresa**. Você entra direto.

![Empresa nova, ainda vazia](screenshots/10-empresa-nova.jpg)

Uma empresa nova começa vazia, com tudo zerado. Não aparece o aviso amarelo de demonstração.

## 2. O painel

![Painel](screenshots/02-painel.jpg)

* **Cartões do topo**: quanto foi recebido no mês, quanto está em aberto, quanto está atrasado e a inadimplência
  (atrasado dividido pelo total válido).
* **Gráfico**: o que foi emitido (azul-claro) e recebido (verde) em cada mês.
* **Rosca**: quantas cobranças há em cada situação.
* **Próximos vencimentos** e **Atrasadas**: as cobranças que pedem atenção, com os botões de cobrar.

Os números são calculados pelo serviço de relatórios a partir dos eventos do Kafka e se atualizam sozinhos a cada
poucos segundos.

## 3. Cadastrar um cliente

Abra **Clientes** e clique em **Novo cliente**.

![Cadastro de cliente](screenshots/11-cadastro-cliente.jpg)

* **Nome ou razão social** e **e-mail** são obrigatórios.
* **CPF ou CNPJ** é conferido pelos dígitos verificadores: um número inválido é recusado.
* **WhatsApp** é opcional, mas é ele que habilita o botão de cobrança. Digite só os números, com DDD
  (por exemplo `11987654321`); o campo formata sozinho como `(11) 98765-4321`.

![Cliente cadastrado](screenshots/12-cliente-criado.jpg)

O mesmo CPF/CNPJ pode ser cliente de duas empresas diferentes, mas não duas vezes na mesma empresa.

![Clientes](screenshots/05-clientes.jpg)

Cada cartão mostra quanto o cliente ainda deve ("A receber") e o botão verde de conversa no WhatsApp.

## 4. Emitir uma cobrança

Abra **Cobranças** e clique em **Nova cobrança**.

![Nova cobrança](screenshots/04-nova-cobranca.jpg)

* Escolha o **cliente** e escreva a **descrição** (por exemplo, "Honorários de novembro").
* **Valor**: digite como no dia a dia (`1.500,00`). O sistema guarda em centavos.
* **Vencimento**: não pode ser uma data passada.

## 5. Acompanhar, cobrar e dar baixa

![Lista de cobranças](screenshots/03-cobrancas.jpg)

* Use os filtros no alto (**Todas**, **Em aberto**, **Vencida**, **Paga**, **Cancelada**) e a busca por cliente ou
  descrição.
* Em cada cobrança em aberto ou vencida há três botões:
  * **Balão verde, cobrar pelo WhatsApp**: abre o WhatsApp com a conversa do cliente e a mensagem já escrita. Antes do
    vencimento a mensagem é um lembrete simpático; depois do vencimento fica mais firme. Você só confere e aperta
    enviar. O botão fica apagado se o cliente não tem telefone.
  * **Visto, marcar como paga**: dá baixa. A cobrança vira "Paga" e o cliente recebe o aviso de pagamento.
  * **X, cancelar**: cancela a cobrança, depois de uma confirmação.
* Uma cobrança paga ou cancelada não pode ser paga nem cancelada de novo.
* Quando o vencimento passa, a cobrança vira **Vencida** sozinha (uma rotina diária do serviço em Java faz isso).

## 6. Avisos aos clientes

![Avisos](screenshots/06-avisos.jpg)

Cada cobrança criada, paga ou vencida gera um aviso por e-mail ao cliente. O serviço em Node.js consome os eventos do
Kafka e registra aqui o que foi enviado. Nesta demonstração os e-mails vão para uma caixa de e-mail de teste
(Mailpit), e nenhuma mensagem real sai. Para cobrar de verdade, use o botão de WhatsApp.

## 7. Modo escuro e celular

![Modo escuro](screenshots/07-modo-escuro.jpg)

O botão de lua, no canto inferior esquerdo, alterna entre o tema claro e o escuro (o sistema lembra a sua escolha).

![Celular](screenshots/08-celular.jpg)

No celular o menu vira uma barra de navegação na parte de baixo, e as tabelas viram cartões.

## 8. Para mostrar numa entrevista

1. Entre como visitante e mostre o painel com números e o gráfico.
2. Cadastre um cliente com WhatsApp e emita uma cobrança.
3. Clique no balão verde: o WhatsApp abre com a mensagem pronta.
4. Marque como paga e veja os totais mudarem sozinhos: foi o Java gravando o evento, o Kafka entregando e o Python
   recalculando.
5. Abra o Kafka UI (`/kafka`) para mostrar a mensagem do evento e o Mailpit (`/mail`) para mostrar o e-mail que o
   serviço Node.js enviou.

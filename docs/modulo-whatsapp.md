# Módulo WhatsApp

IA de vendas do CNV no WhatsApp: tira dúvidas, cadastra o lojista, gera a
assinatura e passa para um humano quando precisa. Fica em
`/dashboard/admin/whatsapp`, no perfil administrador.

Veio do app separado `whatsappcnv` (whatsapp.cnv0km.com.br). Não houve
migração de dados — aquele app já usava **o mesmo MongoDB** (banco `zerokm`,
coleções prefixadas com `wa_`), **o mesmo Firebase** e **a mesma conta do
Mercado Pago**. O que se moveu foi código.

## O corte

> Enquanto o deploy do `whatsappcnv` estiver no ar com os crons ligados, **os
> dois vão processar a mesma fila** — a mesma conversa respondida duas vezes, a
> mesma campanha disparada duas vezes. A ordem abaixo existe por isso.

1. **Variáveis de ambiente** na Vercel da zerokm: o bloco "Módulo WhatsApp" do
   `.env.example`. `NEXT_PUBLIC_SITE_URL` = `https://www.cnv0km.com.br`.
2. **Desligue os crons do `whatsappcnv`** (ou pause o projeto na Vercel). A
   partir daqui a IA para de responder até o passo 4.
3. **Webhook da Meta** → `https://www.cnv0km.com.br/api/webhooks/meta`, campo
   assinado `messages`, verify token igual ao `META_VERIFY_TOKEN`. A rota já
   responde ao handshake de verificação.
4. **Deploy da zerokm.** Os quatro workers do `vercel.json` assumem a fila.
5. **Confira** `/dashboard/admin/whatsapp/configuracao` — a aba de diagnóstico
   testa banco, Firebase, Gemini, número da Meta e Mercado Pago, um a um.
6. **Política de privacidade**: se o app da Meta aponta para
   `whatsapp.cnv0km.com.br/politica-de-privacidade`, troque para
   `https://www.cnv0km.com.br/whatsapp/politica-de-privacidade`.
7. **Quem consome `/api/v1`** precisa trocar o domínio nas chamadas. As chaves
   continuam valendo: estão no mesmo banco. Alternativa sem quebrar ninguém:
   apontar `whatsapp.cnv0km.com.br` para o deploy da zerokm como domínio
   adicional.
8. **Procob**: a conta é liberada por IP e o deploy passa a ser outro — reveja
   `FIXIE_URL`/`PROCOB_PROXY_URL`.

Só depois disso o repositório `whatsappcnv` e o projeto dele na Vercel podem ser
apagados.

## O fluxo da IA (Gemini)

1. Tira dúvidas com a base de conhecimento do CNV (editável na tela IA & WABA);
2. Induz ao cadastro — coleta nome, e-mail e CPF/CNPJ e chama `criar_cadastro`;
3. Gera a assinatura (`gerar_pagamento`: PIX ou link com cartão em até 12x);
4. Em caso de resistência, oferece o teste grátis de 24h (que é o próprio
   cadastro — o trial ativa sozinho);
5. `transferir_para_humano` manda a conversa para a fila da Central.

A "situação do cliente" (sem cadastro / trial ativo / assinante) é recalculada
a cada mensagem, lendo as mesmas coleções `users`, `plans` e `payments` que o
resto da zerokm usa, e é injetada no prompt.

O cadastro criado pela IA replica o fluxo de `POST /api/cadastro/cliente`:
senha temporária + `forcePasswordChange`, perfil `gratis` e teste grátis de 24h
automático. A cobrança usa `external_reference` no formato
`firebaseUid:planId:billingType` e `notification_url` apontando para
`/api/webhooks/mercadopago` — a ativação da assinatura continua centralizada lá.

## Canais (WhatsApp, Instagram, Messenger e SMS)

A conexão segue o padrão do Chatrun: cada número de WhatsApp e cada conta do
Instagram é um **canal** (`wa_channels`), com as próprias credenciais
(cifradas com `APP_ENCRYPTION_KEY`) e um dono — `tenantId: null` é o CNV (a
Vera). É o mesmo modelo que as lojas vão usar quando assinarem o atendimento.

- **WhatsApp do CNV:** continua no formulário da tela IA & WABA. O que antes
  ficava em `wa_settings` é copiado para o canal na primeira leitura e os
  campos antigos são apagados — uma fonte só. Sem nada no banco, valem as
  `META_*` do deploy;
- **Instagram:** botão "Conectar Instagram" na mesma tela → login da conta
  profissional → o canal nasce sozinho e a conta é inscrita no webhook. O
  token dura 60 dias e é renovado pelo cron diário `/api/wa/workers/instagram-tokens`;
- Cada conversa guarda o `channelId`. Quem envia (`sendAndLogText`) descobre o
  canal pela conversa — a IA, a Central e a API não precisam saber qual é.
  Conversa antiga, sem canal, é do WhatsApp do CNV.

O que muda no Direct:

- Contato do Instagram não tem telefone: a chave `phone` vira `ig:<IGSID>` e
  `igUserId`/`igUsername` guardam a identidade;
- A Vera recebe no prompt o bloco `{{canal}}` (entra sozinho mesmo em prompt
  personalizado sem o marcador): no Direct ela pede também o **celular**, e o
  `criar_cadastro` recusa com uma pergunta fixa enquanto ele não vier. O
  celular fica em `whatsappPhone` e vai para o usuário da zerokm;
- Não existe template no Instagram. A IA responde dentro das 24h; a equipe na
  Central ainda fala até 7 dias depois (tag `HUMAN_AGENT`), e passado isso só
  quando a pessoa escrever de novo;
- Se a equipe responder pelo app do Instagram, o eco chega no webhook: a
  conversa vai para "Em atendimento" e a IA para;
- O `*negrito*` das mensagens fixas é tirado no envio — o Direct mostraria cru.

No app da Meta (produto Instagram):

- Redirect do login: `https://www.cnv0km.com.br/api/wa/instagram/callback`;
- Webhook: `https://www.cnv0km.com.br/api/webhooks/instagram`, campos
  `messages`, `messaging_postbacks`, `messaging_seen`, `message_reactions`,
  `message_echoes`;
- Permissões: `instagram_business_basic` e `instagram_business_manage_messages`.

### Messenger (Página do Facebook)

Portado do Chatrun (088). "Conectar Messenger" (`/api/wa/messenger/connect`)
→ login do Facebook com `state` assinado → `/api/wa/messenger/callback` troca
o código por token de longa duração e lista as Páginas. Uma Página só:
conecta direto. Várias: o login fica 15 minutos em `wa_messenger_choices`
(índice TTL, token cifrado) e a Configuração abre a escolha
(`/api/wa/messenger/choice`, só para o mesmo dono). O canal guarda
`fbPageId`, `fbPageName`, `fbPageToken` (cifrado; token de Página não vence,
sem worker de renovação) e `fbUserId`.

- Contato do Messenger: `phone` = `fb:<PSID>` e `fbPsid`. Vale tudo do
  Direct: a Vera pede o celular para o cadastro, 24h para a IA e até 7 dias
  para a equipe com `HUMAN_AGENT`, eco (resposta pelo Facebook/Business
  Suite) pausa a IA — o eco com o `app_id` do nosso app é ignorado;
- No app da Meta (produto Messenger): redirect
  `https://www.cnv0km.com.br/api/wa/messenger/callback`; webhook
  `https://www.cnv0km.com.br/api/webhooks/messenger` (objeto `page`) com
  `MESSENGER_WEBHOOK_VERIFY_TOKEN`, campos `messages`, `messaging_postbacks`,
  `message_echoes`, `message_deliveries`, `message_reads`,
  `message_reactions`; permissões `pages_show_list`, `pages_messaging`,
  `pages_manage_metadata`, `pages_read_engagement`, `business_management`
  (no "Login do Facebook para Empresas", numa configuração cujo id vai em
  `MESSENGER_LOGIN_CONFIG_ID`).

### SMS e RCS

Portado do Chatrun (107/115) **sem créditos**: cada loja paga o próprio
disparo, com a conta dela no provedor. `POST /api/wa/sms` cria/atualiza o
canal `sms` da loja (um por loja): provedor `zenvia` ou `comtele`, token
(cifrado), remetente (Zenvia), rota (Comtele) e agente RCS (só Zenvia). A
conta é conferida no provedor antes de gravar.

- Contato do SMS é o telefone canônico — o mesmo contato do WhatsApp. A
  conversa segue o canal por onde o cliente escreveu por último: respondeu
  por SMS, a conversa passa para o canal SMS (e volta ao WhatsApp quando ele
  escrever lá). Sem SMS no meio, nada muda;
- SMS não tem janela nem template. A IA **não** responde por SMS: a resposta
  do cliente vai direto para "Aguardando" (fila da equipe);
- RCS: com `rcsAgentId` a mensagem vai por `/channels/rcs` da Zenvia, que cai
  para SMS sozinha quando o aparelho não tem RCS. `WaMessage.via` guarda por
  onde foi (o status da Zenvia corrige);
- Webhook por canal: `/api/webhooks/sms/<id do canal>/<segredo>`. Os
  provedores não assinam o que mandam, então o segredo no caminho (gerado
  por canal, cifrado) é a autenticação. Na Zenvia a assinatura é criada ao
  salvar a conta (com o token da loja); na Comtele o gestor cola o endereço
  (mostrado no cartão) no painel da Comtele, para status e respostas.

## As telas

| Grupo | Tela | O que faz |
|---|---|---|
| Operação | `/visao-geral` | KPIs do dia, funil de 30 dias (disparo → resposta → cadastro → pagamento → assinatura) e o que a IA fez sozinha |
| | `/central` | Fila com filtros (aguardando, com a IA, em atendimento, minhas, SLA violado, resolvidas), chat e **dossiê do lojista**. **Nova conversa** (número + template aprovado) e, fora da janela de 24h, **Enviar template** para reabrir |
| | `/pipeline` | Kanban por etapa (abordado → em conversa → cadastrado → pagamento enviado → assinante / perdido), com arrastar |
| | `/contatos` | Quem passou pelo número, com busca, situação no CNV, cobranças e opt-out |
| Base | `/contatos/enriquecer` | Procob: CNPJ → sócios → celulares e e-mails (só administrador) |
| | `/contatos/pesquisas` | Histórico das consultas à Procob, com busca por nome, telefone ou e-mail |
| | `/importacao` | CSV com mapeamento de colunas detectado |
| Disparo | `/campanhas`, `/campanhas/nova`, `/templates` | Assistente em 4 passos; templates criados e submetidos direto à Meta |
| Gestão | `/usuarios`, `/configuracao` | Allowlist e papéis do módulo; IA, WABA, simulador e **API e integrações** |

Todas moram sob `/dashboard/admin/whatsapp`. A única página **pública** é
`/whatsapp/politica-de-privacidade`: a Meta exige uma URL aberta para aprovar o
app e a LGPD exige que o titular leia sem cadastro.

## As regras que sustentam o produto

**Etapa do pipeline** (`wa_conversations.stage`) avança sozinha pelo fluxo — o
disparo cria em `abordado`, a resposta leva a `conversa`, `criar_cadastro` a
`cadastro`, `gerar_pagamento` a `pagamento`, e a assinatura ativa (relida a cada
mensagem) a `ganho`. O avanço automático nunca rebaixa nem sai de `ganho`;
arrastar no kanban é o movimento manual. O SLA da Central é `waitingSince` acima
de 15 minutos.

**Campanhas** têm janela de trabalho (dias e horário, no fuso de Brasília),
limite diário, ritmo entre mensagens, agendamento e **cadência de follow-up**:
quem não responde recebe outro toque; quem responde tem a cadência cancelada no
mesmo instante. A audiência sai do CNPJá, da base importada/enriquecida, de um
CSV ou **por pessoa** (os vários celulares do mesmo sócio — quando um responde,
os outros que ainda não saíram são cancelados). Nada com variável vazia entra na
fila: a Meta recusa a mensagem inteira nesse caso.

**Enriquecer** usa a API da Procob em dois caminhos, no mesmo cache: por CNPJ
(`L0006` devolve os sócios com CPF completo; `L0001` traz celulares e e-mails de
cada sócio escolhido) e por CPF (pula o CNPJ). **Nada é pesquisado duas vezes**:
toda entrada passa por `POST /api/wa/enrichment/check` antes de qualquer chamada
paga, e reconsultar uma resposta com menos de 24h devolve 409 pedindo
confirmação. Sócio falecido (o próprio quadro societário acusa) some da lista e
nunca entra em campanha. Sem `PROCOB_API_USER`/`PROCOB_API_PWD` o app usa o
sandbox público e a tela avisa que os dados são fictícios. A conta da Procob é
liberada por IP — e a Vercel não tem IP fixo: as chamadas saem por um proxy
(`FIXIE_URL`, lida automaticamente, ou `PROCOB_PROXY_URL`).

**Carteira Procob** no header: a Procob não tem rota de extrato, então o saldo
que vem de carona em toda resposta é guardado a cada consulta paga. O indicador
lê o banco (custo zero) e o extrato reconstrói o gasto consulta a consulta; ir à
Procob só no clique explícito.

**API e integrações** (Configurações, só administrador):

- **Chaves de API** (`cnv_live_…`, mostradas uma vez; só o sha256 fica no banco)
  autenticam `/api/v1` — contatos, conversas, mensagens, iniciar conversa por
  template, referência de eventos;
- **Webhooks**: cada endpoint escolhe seus eventos (`conversa.criada`,
  `conversa.atribuida`, `conversa.transferida`, `conversa.resolvida`,
  `mensagem.recebida`, `mensagem.enviada`, `cadastro.criado`,
  `pagamento.gerado`, `negocio.etapa_alterada`, `contato.optout`). Toda entrega
  vai assinada (`X-CNV-Signature: sha256=HMAC(segredo, corpo)`) com o retrato da
  conversa no payload; o envio roda depois da resposta e o que falhar volta pelo
  worker `/api/wa/workers/webhooks` (1 min, 5 min, 30 min, 2 h).

**Templates** cria e submete o template direto para a Meta — sem entrar na
Business Manager. Valida antes de enviar (nome minúsculo, variáveis
sequenciais, exemplo para cada variável), mostra status, motivo de recusa e
prévia da bolha.

## Quem entra

Autenticar é da zerokm (Firebase + NextAuth, `lib/authOptions.ts`); autorizar é
do módulo. Duas portas, nesta ordem (`wa/lib/panel-role.ts`):

1. perfil `administrador` na zerokm → entra como `admin`, sempre;
2. e-mail na coleção `wa_admins` → entra com o papel de lá (`admin` ou
   `operador`).

Estar na allowlist como `operador` **não** rebaixa um administrador da zerokm.
A allowlist existe para o contrário: dar a fila da Central a quem atende
WhatsApp sem lhe entregar o painel inteiro. Com a coleção vazia — que é o estado
atual — só administradores da zerokm entram, e `/usuarios` avisa que está em
modo bootstrap.

São **três** trancas, de fora para dentro:

- `proxy.ts` barra no edge lendo `waRole` do token JWT. É rápido e não alcança
  o Mongo, então confia no token;
- `wa/lib/guard.ts` (layout do módulo) relê o papel do Mongo e redireciona;
- `requirePanelUser`/`requireAdmin` (`wa/lib/auth.ts`) releem de novo em cada
  rota de API e respondem 401/403.

A segunda e a terceira são o que importa: um token de alguém que saiu da
`wa_admins` depois de entrar passa pelo proxy e é barrado ali. `waRole` entra no
token em `lib/authOptions.ts`, no login e sempre que o JWT é renovado por
mudança de plano.

## Estrutura do código

| Onde | O quê |
|---|---|
| `wa/lib/ai.ts` | cérebro da IA (prompt CNV + tools + execução) |
| `wa/lib/inbound.ts` | pipeline de mensagem recebida → fila `wa_aijobs` |
| `wa/lib/register.ts`, `wa/lib/payments.ts` | cadastro e cobrança na base da zerokm |
| `wa/lib/dossier.ts` | situação do lojista que a Central e a API pública mostram |
| `wa/lib/meta.ts` | wrapper da Cloud API, incluindo criação de template |
| `wa/lib/procob.ts`, `wa/lib/enrichment.ts` | bureau e o que fica no banco |
| `wa/lib/audience/` | CSV, detecção de colunas e gravação da base |
| `wa/lib/webhooks.ts`, `wa/lib/api-keys.ts` | integrações de saída e de entrada |
| `wa/models/wa.ts` | coleções operacionais |
| `wa/models/panel.ts` | acesso, chaves e webhooks |
| `wa/models/base.ts` | empresas, sócios e consultas |
| `wa/styles/` | o CSS do módulo (ver abaixo) |
| `app/dashboard/admin/whatsapp/` | as telas |
| `app/whatsapp/` | a única página pública (política de privacidade) |
| `app/api/wa/` | rotas do painel |
| `app/api/v1/` | API pública (chaves `cnv_live_…`) |
| `app/api/webhooks/meta/` | webhook da Meta |
| `scripts/wa/` | `meta-connect`, `meta-template`, `backfill-stages` |

O alias `@wa/*` aponta para `wa/`. Dentro do módulo, `@/` continua sendo a
zerokm — é assim que `wa/lib/payments.ts` importa `@/models/Plan`. **Os models
`User`, `Plan` e `Payment` são os da zerokm**; o app antigo mantinha cópias que
não podiam divergir, e essa armadilha deixou de existir.

As rotas do painel ganharam o prefixo `/api/wa/` porque nomes como
`/api/users`, `/api/settings` e `/api/status` são genéricos demais para ocupar
a raiz da API da zerokm. `/api/v1` e `/api/webhooks/meta` **não** mudaram de
caminho: a primeira é a API pública com chaves já distribuídas, e a segunda é o
que se registra na Meta.

Workers (crons no `vercel.json`, autenticados por `Authorization: Bearer
$CRON_SECRET`): `/api/wa/workers/{ai,campaigns}` a cada minuto,
`/api/wa/workers/followups` a cada 15 min e `/api/wa/workers/webhooks` a cada
5 min.

## O estilo

O módulo é Tailwind v4; a zerokm é CSS Modules. Os dois convivem porque tudo do
módulo vive sob `.wa-scope`, a `<div>` que os layouts abrem. Três decisões
sustentam isso — todas em `wa/styles/whatsapp.css`, que tem os porquês por
extenso:

1. **preflight escopado** (`wa/styles/preflight-escopado.css`). O reset do
   Tailwind zera margem, borda e tipografia de *todo* elemento; solto,
   reescreveria o painel inteiro. O arquivo é **gerado** a partir de
   `node_modules/tailwindcss/preflight.css` com cada seletor embrulhado em
   `.wa-scope :where(...)`. **Ao subir o Tailwind de versão, regere em vez de
   editar à mão.**
2. **utilitários com `important`**. O CSS global da zerokm (`table`, `th`, `td`,
   `a`, `input:invalid`) não está em camada, e no cascade o que está fora de
   camada ganha de tudo que está dentro. Sem o `important`, as tabelas do módulo
   herdariam o padding e o zebrado âmbar da zerokm.
3. **`@source` explícito**, para o Tailwind varrer só `wa/` e as duas pastas de
   rota do módulo.

Dois tokens colidiam com a zerokm em `:root`: `--color-surface` (que na zerokm
vale `#111d2c`) e `--font-sans`. O primeiro foi renomeado no módulo para
`--color-paper` — por isso as classes são `bg-paper`, não `bg-surface`. O
segundo é declarado no módulo com o valor da zerokm, o que torna a colisão
inofensiva por construção.

O tema claro/escuro do módulo é a classe `.wa-dark` na própria `.wa-scope`
(padrão: escuro, a identidade do CNV). Não encosta no tema da zerokm, que é
`data-theme` no `<html>`.

## Variáveis de ambiente

O bloco "Módulo WhatsApp" do `.env.example`. Banco, Firebase e Mercado Pago já
eram compartilhados e não se repetem. As que faltarem não derrubam o app: cada
tela avisa o que está faltando.

`META_TOKEN`, `META_PHONE_NUMBER_ID`, `META_WABA_ID` e `META_APP_SECRET` também
podem ser preenchidos pela tela IA & WABA, que valida na Meta antes de gravar e
guarda cifrado com `APP_ENCRYPTION_KEY`.

No app da Meta, o webhook do WhatsApp é:

- URL: `https://www.cnv0km.com.br/api/webhooks/meta`
- Verify token: o mesmo `META_VERIFY_TOKEN` (ou o da tela IA & WABA)
- Campo assinado: `messages`.

## O que mudou ao sair do app separado

- **A sessão ociosa de 25 minutos saiu.** No app separado ela derrubava só o
  painel do WhatsApp; aqui derrubaria a sessão da zerokm inteira, o que seria
  uma surpresa desagradável para quem estava no CRM. A política de sessão agora
  é a da zerokm. Se a ociosidade voltar, ela tem que ser uma decisão da zerokm,
  valendo para todos.
- **`lib/firebase-admin.ts` da zerokm foi promovido** à versão do app antigo:
  aceita `FIREBASE_PRIVATE_KEY_BASE64`, remonta PEM cujas quebras de linha se
  perderam, e expõe `privateKeyShape()` (retrato do formato, nunca do conteúdo)
  para a tela de Diagnóstico. O bloco que imprimia pedaços da chave no console
  em desenvolvimento saiu junto. Use `scripts/firebase-key-base64.mjs` para
  preparar a chave para a Vercel.
- **O webhook da Meta acorda o worker de IA por `siteUrl(req)`**, não mais lendo
  `NEXT_PUBLIC_SITE_URL` direto — essa variável já foi para produção valendo
  `localhost`, e a IA passou a só responder no minuto seguinte, pelo cron.
- **`scripts/fix-firebase-key.sh` não veio.** Ele rodava `vercel env rm` num
  loop e já zerou as 20 variáveis do projeto uma vez; o próprio cabeçalho dele
  mandava usar `firebase-key-base64.mjs`, que veio.

## Atendimento das lojas (Chatrun dentro da zerokm)

O mesmo motor da Vera atende as **lojas** — concessionárias e lojistas — em
`/dashboard/atendimento` (botão "Atendimento" no painel de cada uma). Cada
loja é um `WaStore` (`wa_stores`) e tudo do atendimento carrega `tenantId`:
`null` é o CNV (a Vera), qualquer outro valor é a loja. As rotas compartilhadas
(`/api/wa/conversations`, contatos, funil, campanhas, templates, canais, mídia)
filtram por `tenantId` via `wa/lib/scope.ts`; as que só existem para o CNV
(enriquecimento, importação, Procob, integrações, usuários) continuam fechadas
para lojas.

- **Funcionalidades liberadas pelo CNV** (`lib/recursos.ts`, como no Chatrun):
  em Admin → Funcionalidades, cada concessionária e cada lojista tem a lista do
  que pode usar — CRM, Meus anúncios, Favoritos, Atendimento, Funil, Campanhas,
  Estoque do pátio, Instagram, Messenger, SMS/RCS, IA de vendas, simulação de
  financiamento e vender a rede. Grava só a diferença do padrão em
  `Concessionaria.recursos` / `User.recursos` do lojista titular. O que já
  existia segue ligado; **o atendimento e o Messenger nascem desligados** e são
  liberados conta a conta. Desligado some do menu e a rota recusa (403);
- **Quem entra:** o usuário da concessionária (gestor da loja dela), o lojista
  titular (gestor), os sub-usuários convidados pelo lojista (atendentes) e quem
  o gestor puser na equipe (por e-mail, com login da zerokm). A loja nasce no
  primeiro acesso depois de o CNV liberar o atendimento, com 7 dias de teste;
- **Canais:** WhatsApp pelo popup da Meta (Embedded Signup) ou cadastro manual,
  inclusive coexistência com o app do celular (o eco pausa a IA); Instagram
  pelo mesmo login do Instagram da Vera;
- **IA de vendas** (`wa/lib/ai-loja.ts`): chave da própria loja (Gemini,
  OpenAI ou Claude), prompt editável, e as ferramentas `buscar_estoque`,
  `simular_financiamento`, `registrar_interesse`, `agendar_visita`,
  `registrar_captacao`, `transferir_para_vendedor`, `enviar_localizacao`;
- **Estoque:** sempre o da zerokm (`wa/lib/estoque.ts`). Concessionária vende o
  0km e o repasse dela. Lojista vende o **estoque do pátio** (cadastrado em
  "Estoque do pátio", gravado na `RepasseVehicle` com `lojistaId` — fora da
  vitrine) e, com "vender estoque da rede" ligado e a assinatura da zerokm em
  dia, o 0km e o repasse da rede com a margem dele aplicada;
- **CRM:** na concessionária, interesse, visita/test drive, captação e
  transferência viram lead (e tarefa) no CRM que ela já usa;
- **Funil:** as mesmas etapas da Vera com nomes de venda de carro
  (Em atendimento → Visita / test drive → Proposta → Vendido);
- **Campanhas e templates:** saem do WhatsApp da loja, para a lista dela (CSV);
- **Assinatura:** planos com público "Atendimento" (Configurações → Planos),
  PIX no Mercado Pago com referência `ATEND:` e ativação pelo webhook; o CNV
  ativa à mão em WhatsApp → Lojas (atendimento). Sem assinatura (nem teste) a
  IA para e as conversas vão direto para a equipe. A IA e os disparos a loja
  paga direto aos provedores.

**Antes de abrir para as lojas**, rode no banco de produção:

```bash
node scripts/wa/migrar-atendimento-lojas.cjs           # mostra
node scripts/wa/migrar-atendimento-lojas.cjs --aplicar # grava
```

Ele troca o índice único de telefone dos contatos (`phone_1`) por
`{ tenantId, phone }` — sem isso o mesmo cliente não pode ser contato do CNV e
de uma loja — e cria os índices novos.

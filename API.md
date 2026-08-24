# API do Vistoow — Guia para o Frontend

Referência completa de todos os endpoints do backend: como autenticar, o que
enviar e o que esperar de volta. Revisado a partir do código-fonte em
2026-07-30 — se algo aqui divergir do comportamento real, o código
(`src/**/*.controller.ts`, `src/**/dto/*.dto.ts`) é a fonte da verdade.

## Sumário

- [Convenções gerais](#convenções-gerais)
- [Autenticação](#autenticação)
- [Clientes](#clientes-clients)
- [Projetos](#projetos-projects)
- [Vídeos](#vídeos-videos)
- [Board Kanban (demandas)](#board-kanban-demandas)
- [Portfólios](#portfólios-portfolios)
- [Portfólio: perfil e categorias](#portfólio-perfil-e-categorias-portfolio-profile-portfolio-categories)
- [Comentários (canais autenticados)](#comentários-canais-autenticados)
- [Perguntas de avaliação](#perguntas-de-avaliação-rating-questions)
- [Desempenho da equipe](#desempenho-da-equipe-team)
- [Conta / equipe (convites, membros e sessões)](#conta--equipe-account)
- [Perfil](#perfil-usersme)
- [Branding / white label](#branding--white-label-users)
- [Planos](#planos-plans)
- [Pagamento](#pagamento-billing)
- [Notificações](#notificações-notifications)
- [Calendário de gravações](#calendário-de-gravações-recording-events)
- [Equipe de gravação](#equipe-de-gravação-crew)
- [Dashboard](#dashboard)
- [Relatório do projeto (PDF)](#relatório-do-projeto-pdf)
- [Acesso público do cliente (sem autenticação)](#acesso-público-do-cliente-sem-autenticação)
- [Admin](#admin)
- [Health check](#health-check)
- [Fluxo de upload de vídeo](#fluxo-de-upload-de-vídeo)

## Convenções gerais

**Base URL**: todas as rotas abaixo estão sob o prefixo `/api`. Em dev local:
`http://localhost:3000/api`.

**Autenticação**: JWT via header `Authorization: Bearer <access_token>`.
O token é obtido em `/auth/login`, `/auth/register`, `/auth/google`,
`/auth/apple` ou `/account/invite/:token/accept`. Expira por padrão em `7d`
(`JWT_EXPIRES_IN`). Quando expira ou é inválido, qualquer rota autenticada
responde `401`. Se a conta estiver com `status = suspenso`, responde `403`
mesmo com token válido.

**Roles**: `admin`, `owner`, `editor`.
- `owner` = dono da agência (quem se cadastra em `/auth/register`).
- `editor` = membro convidado pelo owner (via `/account/invite`).
- `admin` = administrador da plataforma, não pertence a nenhuma agência.

Cada rota autenticada abaixo indica quais roles têm acesso. Rotas sem essa
indicação e sem "sem autenticação" explícito devem ser tratadas como
autenticadas com qualquer role válido.

**Escopo por conta**: `owner` e `editor` só enxergam dados da própria
agência (`accountId` do token). Nunca é possível acessar cliente/projeto/vídeo
de outra agência, mesmo sabendo o `id`.

**Validação de body**: todo body é validado (`class-validator`). Campos não
declarados no DTO causam `400` (`forbidNonWhitelisted`). Campos obrigatórios
ausentes ou de tipo errado também causam `400` com `message` sendo um array
de strings (uma por campo inválido).

**Formato de erro** (padronizado, inclusive erros do Prisma):
```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Email invalido",
  "timestamp": "2026-07-06T12:00:00.000Z",
  "path": "/api/auth/login"
}
```
`message` pode ser `string` ou `string[]` (validação com múltiplos campos).

**Rate limiting**: padrão global de **60 requisições/minuto por IP**. Rotas
sensíveis têm limite próprio (indicado em cada seção): `429 Too Many
Requests` quando estourado.

**CORS**: a origem do frontend precisa estar em `CORS_ORIGIN` no backend
(lista separada por vírgula). Sem isso configurado, nenhuma origem é
liberada — se o front rodar em uma URL nova (preview, domínio custom),
avisar o time de backend para adicionar.

**Datas**: sempre ISO 8601 (`criadoEm`, `aprovadoEm`, `deadline`, etc).

---

## Autenticação

### `POST /auth/register`
Sem autenticação. Rate limit: **5/min**.

Cria a agência (`Account`) + o usuário `owner`. Dispara em background a
criação de dados de exemplo (cliente/projeto/vídeo com `isExemplo: true`).

Body:
```json
{ "nome": "Maria Silva", "email": "maria@agencia.com", "senha": "123456", "nomeAgencia": "Agência Maria" }
```
- `nome`, `email`, `senha` (mín. 6 caracteres) obrigatórios.
- `nomeAgencia` opcional — se omitido, usa `nome`.

Resposta `201`:
```json
{
  "user": {
    "id": "...", "nome": "Maria Silva", "email": "maria@agencia.com", "teamRole": "owner", "status": "ativo", "accountId": "...",
    "logoUrl": null, "corDestaque": null, "nomeAgencia": "Agência Maria",
    "branding": { "logoUrl": null, "corDestaque": null, "nomeAgencia": "Agência Maria" },
    "criadoEm": "...", "emailVerificado": false
  },
  "access_token": "eyJhbGciOi..."
}
```
Erros: `409` se já existe conta com o email.

> `logoUrl`/`corDestaque`/`nomeAgencia` são o branding (white label) da
> agência — ver [Branding / white label](#branding--white-label-usersme).
> Vêm em toda resposta de autenticação (`register`, `login`, `google`,
> `apple`, `select-account`, `account/invite/:token/accept`) e também em
> `GET /users/me`, então o frontend não precisa de uma chamada extra só pra
> pintar a cor/logo depois do login — inclusive ao trocar de dispositivo ou
> reabrir uma sessão. O mesmo trio também vem agrupado em `user.branding`
> (`{ logoUrl, corDestaque, nomeAgencia }`), redundante com os campos soltos
> — use o que for mais conveniente no client, os dois sempre têm o mesmo
> valor. **Resolvido pelo `owner` da conta ativa**, não pelo usuário que
> está logando — um `editor` vê o branding configurado pelo `owner` da
> agência, não colunas próprias (que nunca são preenchidas, já que só
> `owner` pode chamar `PATCH /users/me/branding`).

### `POST /auth/login`
Sem autenticação. Rate limit: **5/min**.

Body: `{ "email": "...", "senha": "..." }`

Resposta `200`, **dois formatos possíveis** (ver
[Multi-conta](#multi-conta-1-pessoa-em-várias-agências) abaixo):
- 1 agência vinculada (caso comum, sem mudança de comportamento): mesmo
  shape de `register` — `{ user, access_token }`.
- 2+ agências vinculadas: `{ requiresAccountSelection: true, pendingToken,
  accounts: [{ accountId, nomeAgencia, role }] }` — **sem** `access_token`.
  O frontend precisa detectar `requiresAccountSelection` e chamar
  `POST /auth/select-account` para terminar o login.

Erros: `401` credenciais inválidas · `403` conta suspensa.

> Nota: `user.teamRole` é o campo que o frontend deve usar para decidir a UI
> por papel (`owner`/`editor`/`admin`) — o Prisma chama esse campo de `role`
> internamente, mas a API sempre expõe como `teamRole`.

### `POST /auth/google`
Sem autenticação. Rate limit: **10/min**.

Login **ou** cadastro via Google — endpoint único para os dois casos. O
frontend/app faz o sign-in nativo com o Google Sign-In SDK (não é o backend
que redireciona para o Google) e manda pra cá o **ID token** retornado pelo
SDK (não confundir com `access_token`).

Body:
```json
{ "idToken": "eyJhbGciOi...", "nomeAgencia": "Agência Maria" }
```
- `idToken` obrigatório.
- `nomeAgencia` opcional, usado **só** se for a primeira vez desse usuário
  (cria a conta) — se omitido, usa o nome do perfil Google.

Resposta `200`: mesmo shape de `login` (pode vir `requiresAccountSelection`
em vez de `access_token` direto, se esse Google já estiver vinculado a um
usuário com 2+ agências — ver [Multi-conta](#multi-conta-1-pessoa-em-várias-agências)).

Comportamento:
- Se já existe uma conta com o `sub` do Google vinculado, loga direto.
- Senão, se já existe uma conta local (ou Apple) com o mesmo e-mail
  **verificado** pelo Google, vincula o Google a essa conta (login local
  continua funcionando normalmente depois).
- Senão, cria a agência + usuário `owner` (igual ao `/auth/register`).

Erros: `401` token inválido ou e-mail não verificado no Google · `403`
conta suspensa, ou `GOOGLE_CLIENT_ID` não configurado no backend.

### `POST /auth/apple`
Sem autenticação. Rate limit: **10/min**.

Login **ou** cadastro via Apple — mesmo conceito do `/auth/google`. O
app faz o Sign in with Apple e manda pra cá o `identityToken` retornado.

Body:
```json
{ "identityToken": "eyJhbGciOi...", "nome": "Maria Silva", "nomeAgencia": "Agência Maria" }
```
- `identityToken` obrigatório.
- `nome` **opcional, mas importante**: a Apple só entrega o nome do
  usuário pro client (`ASAuthorizationAppleIDCredential.fullName`) na
  **primeira** autorização — nunca dentro do token. O frontend precisa
  guardar esse nome nesse primeiro momento e reenviar aqui; se omitido,
  o backend usa a parte local do e-mail como nome.
- `nomeAgencia` opcional, mesmo comportamento do `/auth/google`.

Resposta `200`: mesmo shape de `login` (idem nota de `requiresAccountSelection`
em `/auth/google` acima).

Erros: `401` token inválido ou e-mail não verificado pela Apple · `403`
conta suspensa, ou `APPLE_CLIENT_ID` não configurado no backend.

### `POST /auth/forgot-password`
Sem autenticação. Rate limit: **3/min**.

Body: `{ "email": "..." }`

Resposta `200` sempre `{ "sent": true }`, exista ou não o email na base
(evita que o endpoint seja usado para descobrir emails cadastrados). Se
existir, envia por email (Resend, ou simulado via log sem
`RESEND_API_KEY`) um link `/redefinir-senha/:token` válido por 1 hora.

### `POST /auth/reset-password`
Sem autenticação. Rate limit: **5/min**.

Body: `{ "token": "<uuid>", "novaSenha": "..." }` (mín. 6 caracteres)

Resposta `200`: `{ "reset": true }`.

Erros: `404` token inválido, expirado ou já utilizado. Ao ser consumido
com sucesso, o token invalida quaisquer outros tokens de reset pendentes
do mesmo usuário.

### `POST /auth/confirm-email`
Sem autenticação. Rate limit: **5/min**.

Body: `{ "token": "<uuid>" }`

Resposta `200`: `{ "confirmed": true }`.

Erros: `404` token inválido, expirado ou já utilizado. Ao ser consumido
com sucesso, o token invalida quaisquer outros tokens de confirmação
pendentes do mesmo usuário.

### `POST /auth/resend-confirmation`
Sem autenticação. Rate limit: **3/min**.

Body: `{ "email": "..." }`

Resposta `200` sempre `{ "sent": true }`, exista ou não o email na base, ou
já esteja confirmado (mesmo padrão de `forgot-password` — não revela
estado da conta). Se existir e ainda não confirmado, envia por email um
link `/confirmar-email/:token` válido por 7 dias.

> **Fluxo de confirmação de email:** todo cadastro por email/senha
> (`POST /auth/register`) dispara em background um email de boas-vindas
> contendo esse link de confirmação (válido por 7 dias). Login social
> (Google/Apple) não recebe o link — o provider já garante que o email é
> verificado, então a conta já nasce com `emailVerificado: true`. O campo
> `user.emailVerificado` vem em toda resposta de autenticação
> (`register`/`login`/`google`/`apple`) e em `GET /users/me` — hoje é só
> informativo (login **não** é bloqueado por email não confirmado).

### Multi-conta (1 pessoa em várias agências)

**Novidade (2026-08-11):** um mesmo login (email) agora pode ser membro —
`owner` ou `editor` — de mais de uma agência ao mesmo tempo (ex.: alguém que
já tinha conta própria aceita um convite pra editor em outra agência). Isso
só acontece quando um convite (`POST /account/invite`) é aceito com um email
que já tinha conta — ver seção [Conta / equipe](#conta--equipe-account).

**Se o usuário só tem 1 agência vinculada, nada muda** — `login`/`google`/
`apple` continuam devolvendo `{ user, access_token }` direto, sem nenhum
passo extra. O fluxo abaixo só entra em ação para quem tem 2+.

| Método | Rota | Auth | Body | Retorno |
|---|---|---|---|---|
| `POST` | `/auth/select-account` | `pendingToken` **ou** token completo | `{ accountId }` | `{ user, access_token }` |
| `GET` | `/auth/my-accounts` | qualquer role | — | `[{ accountId, nomeAgencia, role, isCurrent }]` |

- Quando `login`/`google`/`apple` retornam `requiresAccountSelection: true`,
  vem junto `pendingToken` (curto, expira em 5 min, só serve pra esse fluxo)
  e `accounts: [{ accountId, nomeAgencia, role }]` — a lista de agências pra
  mostrar num seletor. O frontend chama `POST /auth/select-account` com
  `Authorization: Bearer <pendingToken>` e `{ accountId: "<escolhido>" }` no
  body, e recebe de volta `{ user, access_token }` normal (mesmo shape de
  `login`), já pronto pra usar no resto da API.
- `select-account` **também funciona com um token completo normal** (não só
  o `pendingToken`) — é o mesmo endpoint usado para trocar de agência ativa
  estando já logado (ex.: um dropdown "trocar de agência" no header). Nesse
  caso a sessão existente é reaproveitada (não desloga de outros
  dispositivos); usando o `pendingToken` (logo após login), uma sessão nova
  é criada normalmente.
- `my-accounts`: lista as agências ativas do usuário logado, com `isCurrent`
  marcando qual é a do token atual — útil pra montar o seletor/dropdown de
  troca de conta sem depender de ter passado pelo fluxo de login com
  `requiresAccountSelection`.
- Erros: `401` `pendingToken`/token inválido ou expirado · `403` se a
  `accountId` escolhida não corresponde a nenhuma agência ativa desse
  usuário (removido/suspenso nela depois do token ter sido emitido).

---

## Clientes (`/clients`)
Autenticado — roles `owner`, `editor`.

| Método | Rota | Body | Retorno |
|---|---|---|---|
| `POST` | `/clients` | `{ nome, email?, descricao?, fotoUrl? }` | `Client` criado |
| `GET` | `/clients` | — | `Client[]` (ordenado por `nome`) |
| `GET` | `/clients/:id` | — | `Client` |
| `PATCH` | `/clients/:id` | `{ nome?, email?, descricao?, fotoUrl? }` | `Client` atualizado |
| `DELETE` | `/clients/:id` | — | `{ "deleted": true }` |
| `POST` | `/clients/:id/photo-upload-url` | `{ nomeArquivo, contentType }` | `{ uploadUrl, key, publicUrl, expiresIn }` |

`Client`: `{ id, nome, email, descricao, fotoUrl, accountId, isExemplo, branding }`.
`email` é opcional. `descricao` e `fotoUrl` alimentam o modo "Preview Reels"
da galeria pública (ver [`GET /public/videos/:linkPublico`](#get-publicvideoslinkpublico)
— campo `cliente`). Deletar um cliente apaga em cascata seus projetos e
vídeos (histórico não é recuperável). Erros: `404` se o cliente não existe
ou não pertence à conta.

`POST /clients/:id/photo-upload-url` gera uma presigned URL pro upload da
foto do cliente (mesmo mecanismo de presigned URL do resto da API — `PUT`
direto no R2, pasta `clients`). `contentType` aceito: `image/png`,
`image/jpeg`, `image/webp`, `image/svg+xml`. Fluxo: gera a URL → `PUT`
direto no R2 → `PATCH /clients/:id` com `{ fotoUrl: publicUrl }`.

> ⚠️ O `:id` na rota não é usado pelo backend (só gera a presigned URL, sem
> tocar no banco) — a validação de que o cliente pertence à conta do token
> acontece só depois, no `PATCH /clients/:id` que efetivamente grava o
> `fotoUrl`. Não depender do `:id` aqui pra nenhum tipo de autorização.

### Marca própria do cliente (`/clients/:id/branding`)
Autenticado — **somente `owner`** (mesma regra do branding da agência).
Permite a agência configurar uma marca (logo + cor) por cliente específico —
pensado pra agência white-label que revende a aprovação pro cliente final
dela: quando configurada, essa marca sobrepõe campo a campo (só logo, só
cor, ou os dois) o branding da agência (`/users/me/branding`) nos links
públicos desse cliente. Requer plano com feature `whiteLabel` (mesma gate
do branding da agência) — `403` se o plano não incluir.

| Método | Rota | Body | Retorno |
|---|---|---|---|
| `POST` | `/clients/:id/branding/logo-upload-url` | `{ nomeArquivo, contentType }` | `{ uploadUrl, key, publicUrl, expiresIn }` |
| `PATCH` | `/clients/:id/branding` | `{ logoUrl?, corDestaque? }` | `{ logoUrl, corDestaque }` |

`contentType` aceito: `image/png`, `image/jpeg`, `image/webp`,
`image/svg+xml`. Mesmo fluxo de presigned URL do branding da agência (`PUT`
direto no R2), só que na pasta `client-branding`. `corDestaque` é hex
(`#RGB` ou `#RRGGBB`). Em `PATCH`, `logoUrl: null` / `corDestaque: null`
limpa o respectivo campo (o cliente volta a herdar o branding da agência);
campo ausente no body deixa como está.

`Client.branding` (exposto em `GET /clients`, `GET /clients/:id`,
`PATCH /clients/:id`): `{ logoUrl, corDestaque } | null` — `null` quando o
cliente não tem nenhuma marca própria configurada (caso mais comum). Esse
mesmo objeto aparece em `cliente.branding` nas rotas públicas
([Galeria pública do projeto](#get-publicprojectslinkpublico) e
[Portfólio público](#get-publicportfolioslinkpublico), quando o álbum
estiver etiquetado com o cliente — ver `Portfolio.clienteId`).

---

## Projetos (`/projects`)
Autenticado — roles `owner`, `editor`.

| Método | Rota | Body | Retorno |
|---|---|---|---|
| `POST` | `/projects` | `{ nome, clientId }` | `Project` criado |
| `GET` | `/projects` | — | `Project[]` (com `client: { id, nome }`, mais recente primeiro) |
| `GET` | `/projects/:id` | — | `Project` (com `client`, `members`) |
| `PATCH` | `/projects/:id` | `{ nome?, clientId? }` | `Project` atualizado |
| `DELETE` | `/projects/:id` | — | `{ "deleted": true }` |
| `POST` | `/projects/:id/members/:memberId` | — | `ProjectMember[]` do projeto (owner) |
| `DELETE` | `/projects/:id/members/:memberId` | — | `ProjectMember[]` do projeto (owner) |

`clientId` deve ser UUID de um cliente da mesma conta (`400` caso contrário).
Deletar um projeto apaga em cascata seus vídeos.

### Escopo de acesso por editor (`ProjectMember`)

`owner` sempre vê/acessa todos os projetos da conta. `editor` só vê/acessa
projetos aos quais foi atribuído — a atribuição é a tabela `ProjectMember`,
gerenciada pelos dois endpoints acima (só `owner` pode chamá-los).

- `GET /projects`: para `editor`, retorna só os projetos onde ele foi
  atribuído (sem paginação, igual antes).
- `GET /projects/:id`, `GET /projects/:id/report`: `404` se um `editor`
  tentar acessar um projeto ao qual não foi atribuído (mesmo padrão dos
  demais 404 de "não encontrado" — não revela se o projeto existe).
- `GET /projects/:id` inclui `members: [{ id, userId, user: { id, nome,
  email } }]` — mesma sombra usada nas respostas de `POST`/`DELETE
  /projects/:id/members/:memberId`.
- `POST /projects/:id/members/:memberId`: idempotente (atribuir quem já é
  membro não gera erro). `memberId` precisa ser `owner` ou `editor` da
  mesma conta (`400` caso contrário).
- Vídeos, comentários internos (canal `interno`) e o vídeo em si (criar,
  mudar status, nova versão) seguem a mesma regra — um `editor` não
  atribuído ao projeto recebe `404` também em `GET /videos?project_id=`,
  `PATCH /videos/:id/status` etc. `GET /videos` sem `project_id` (todos os
  projetos) já vem filtrado igual `GET /projects`.

---

## Vídeos (`/videos`)
Autenticado — roles `owner`, `editor` (exceto onde indicado).

### `POST /videos/upload-url`
Gera uma presigned URL para o frontend fazer upload direto no R2 (o
arquivo **não** passa pelo backend).

Body: `{ "nomeArquivo": "video.mp4", "contentType": "video/mp4" }`
`contentType` aceito: `video/mp4`, `video/quicktime`, `video/webm`,
`video/x-msvideo`, `video/mpeg`.

Resposta `200`:
```json
{ "uploadUrl": "https://...presigned...", "key": "videos/172...-video.mp4", "publicUrl": "https://cdn.../videos/172...-video.mp4", "expiresIn": 600 }
```
O frontend faz `PUT <uploadUrl>` com o binário do arquivo (`Content-Type`
igual ao enviado acima). `expiresIn` em segundos (10 min).

### `POST /videos`
Registra o vídeo após o upload completar. Dispara em background a geração
de thumbnail + versão otimizada (`statusProcessamento` começa em
`processando`, vira `pronto` ou `erro`).

Body: `{ "projectId": "uuid", "urlStorage": "<publicUrl do passo anterior>", "nomeArquivo": "video.mp4", "versao": 1 }`
`versao` é opcional — se omitida, o backend calcula a próxima versão do
projeto automaticamente.

Resposta `201`: o registro completo do `Video` (ver shape abaixo).

### `POST /videos/:id/new-version`
Sobe uma nova versão vinculada ao vídeo anterior (`videoPaiId`), herdando o
projeto e incrementando a versão. Comentários/ratings da versão anterior
continuam ligados a ela (histórico preservado).

Body: `{ "urlStorage": "...", "nomeArquivo": "..." }`

> **Não é preciso reenviar link pro cliente a cada nova versão.** O
> `linkPublico` de qualquer vídeo da cadeia — inclusive o da versão original,
> que o cliente já recebeu — passa a entregar automaticamente a última versão
> (ver [Resolução de versão](#resolução-de-versão-no-canal-público)). O link
> novo desta resposta existe, mas é redundante para o cliente.

### `GET /videos?project_id=<uuid>&page=1&limit=50`
Lista os vídeos de um projeto (mais recente primeiro por versão).
Sem `project_id`, lista os vídeos de **todos os projetos da conta**
autenticada (evita fan-out de uma request por projeto no dashboard).

Escopo por `editor`: ver [seção "Escopo de acesso por editor"](#escopo-de-acesso-por-editor-projectmember)
em Projetos — com `project_id`, `404` se o editor não estiver atribuído ao
projeto; sem `project_id`, a lista já vem filtrada só com os projetos dele.

**Paginado** (`page`/`limit` opcionais, default `page=1`/`limit=50`, `limit`
com teto 100). Resposta:
```json
{
  "data": [ { "...": "Video + videoPai: { id, versao, nomeArquivo } | null + _count: { comments, ratings, versoes }" } ],
  "total": 137,
  "page": 1,
  "limit": 50,
  "totalPages": 3
}
```
> Antes retornava um array puro. Frontends existentes que esperam array
> direto precisam trocar para ler `.data`.

### `PATCH /videos/:id/status`
Body: `{ "status": "pendente" | "aprovado" | "ajuste" | "erro" }`
Ao marcar `aprovado`, o backend carimba `aprovadoEm`.

### `PATCH /videos/:id/etapa`
Etapa de produção interna (board Kanban) — **independente** do `status`
acima, que reflete a decisão do cliente na tela pública. Um vídeo pode
estar `em_edicao` antes mesmo de ir pro cliente, ou `entregue` depois de
aprovado.

Body: `{ "etapa": "planejado" | "producao" | "edicao" | "aguardando_aprovacao" | "ajustes" | "aprovado" | "entregue" }`

> Quando o cliente decide algo na tela pública, a etapa também avança
> sozinha: `POST /public/videos/:linkPublico/approve` → `etapaProducao =
> "aprovado"`; `POST /public/videos/:linkPublico/request-changes` →
> `etapaProducao = "ajustes"`. As demais etapas (`planejado`, `producao`,
> `edicao`, `entregue`) são só manuais — a equipe arrasta o card.

### `PATCH /videos/:id/titulo`
`owner`+`editor` (mesmo padrão de `PATCH /videos/:id/status`). Renomeia o
vídeo.

Body: `{ "nomeArquivo": "novo-nome.mp4" }`

### `PATCH /videos/:id/deadline`
**Somente `owner`.** Define ou remove o prazo de entrega.

Body: `{ "deadline": "2026-08-15" | null }` (ISO 8601; `null` remove o prazo)

> `deadline` nunca é exposto no canal público do cliente
> (`GET /public/videos/:linkPublico`) — é dado interno da agência.

### `PATCH /videos/:id/editor-responsavel`
**Somente `owner`.** Define ou remove o editor (ou o próprio owner)
responsável pelo vídeo — alimenta o [desempenho da equipe](#desempenho-da-equipe-team).

Body: `{ "editorId": "uuid" | null }`
`editorId` precisa ser o `id` de um `owner` ou `editor` **da mesma conta**
(`400` caso contrário); `null` remove a atribuição.

### `DELETE /videos/:id`
**Somente `owner`** (diferente do resto de `/videos`, que aceita
`owner`+`editor` — mesmo padrão de `PATCH /videos/:id/deadline`).
Exclui o vídeo; comentários e ratings são removidos em cascata
(histórico não é recuperável) e os arquivos correspondentes
(`urlStorage`, `urlOtimizada`, `thumbnailUrl`) são removidos do R2.

Resposta: `{ "deleted": true }`

Erros: `404` (vídeo não existe ou não pertence à conta do token — não
vaza existência de vídeo de outra agência), `403` (usuário não é
`owner`), `409` (o vídeo tem versões filhas apontando para ele via
`videoPaiId`; remova/mova as versões antes de excluir o pai).

**Shape do `Video`** (retornado por `POST`, `new-version` e `PATCH`):
```json
{
  "id": "uuid",
  "projectId": "uuid",
  "urlStorage": "https://...",
  "nomeArquivo": "video.mp4",
  "versao": 1,
  "videoPaiId": null,
  "status": "pendente",
  "linkPublico": "aB3xQ9kZ2m",
  "thumbnailUrl": null,
  "urlOtimizada": null,
  "statusProcessamento": "processando",
  "aprovadoEm": null,
  "isExemplo": false,
  "deadline": null,
  "editorResponsavelId": null,
  "notaGeral": null,
  "etapaProducao": "planejado",
  "criadoEm": "2026-07-06T12:00:00.000Z"
}
```
`linkPublico` é o identificador a compartilhar com o cliente
(`/public/videos/:linkPublico` — ver seção própria); string opaca, formato
não deve ser assumido pelo frontend (ver nota na seção de acesso público).
`notaGeral` (1–5) só é
preenchida quando o cliente aprova informando uma nota geral (ver
[`POST /public/videos/:linkPublico/approve`](#post-public-videoslinkpublicoapprove)).

---

## Board Kanban (`/demandas`)
Autenticado — roles `owner`, `editor`.

Cobre a metade do board Kanban que **não** é vídeo: cards genéricos de
projeto/campanha/gravação criados direto no quadro, sem vínculo com nenhum
`Video`. Reaproveita o mesmo enum de etapa de `Video.etapaProducao`
(`EtapaProducao`) — o board trata os dois tipos de card igual. Escopo
direto por conta (como `/recording-events`/`/crew`), não passa por
projeto — todo `owner`/`editor` da conta vê todas as demandas.

### `POST /demandas`
Body: `{ "titulo": "string", "tipo": "projeto" | "campanha" | "gravacao" | "demanda", "clienteId"?: "uuid", "responsavelId"?: "uuid", "prazo"?: "2026-08-20", "etapa"?: "planejado" }`
`etapa` default `planejado` se omitida. `clienteId`/`responsavelId`, quando
enviados, precisam pertencer à mesma conta (`400` caso contrário).

### `GET /demandas`
Lista as demandas da conta autenticada (sem paginação/filtro — o board
filtra por tipo/cliente no próprio frontend).

### `PATCH /demandas/:id`
Edita `titulo`/`tipo`/`clienteId`/`responsavelId`/`prazo`. Mesmo body do
`POST`, todos os campos opcionais (omitir mantém o valor atual; enviar
`null` em `clienteId`/`responsavelId`/`prazo` remove a atribuição). **Não**
move de etapa — use a rota abaixo.

### `PATCH /demandas/:id/etapa`
Body: `{ "etapa": "planejado" | "producao" | "edicao" | "aguardando_aprovacao" | "ajustes" | "aprovado" | "entregue" }`
Mesmo shape de [`PATCH /videos/:id/etapa`](#patch-videosidetapa). Diferente
dos cards de vídeo, aqui não existe sincronia automática — a equipe sempre
arrasta o card manualmente (não há decisão de cliente associada a uma
demanda genérica).

### `DELETE /demandas/:id`
Exclui a demanda. Resposta: `{ "deleted": true }`.

**Shape da `Demanda`** (retornado por `POST`/`PATCH`/`GET`):
```json
{
  "id": "uuid",
  "titulo": "Campanha de lançamento",
  "tipo": "campanha",
  "clienteId": null,
  "responsavelId": null,
  "prazo": null,
  "etapa": "planejado",
  "videoId": null,
  "criadoEm": "2026-08-10T12:00:00.000Z",
  "atualizadoEm": "2026-08-10T12:00:00.000Z",
  "clienteNome": null,
  "responsavelNome": null
}
```
`clienteNome`/`responsavelNome` vêm resolvidos via join (mesmo padrão de
`clienteNome`/`membroNome` em [Calendário de gravações](#calendário-de-gravações-recording-events)) — o frontend não precisa
buscar cliente/usuário à parte pra renderizar o card. `videoId` existe no
schema pra uma futura demanda "virar" ou referenciar um vídeo específico,
mas **nenhuma rota atual permite setá-lo** — hoje sempre vem `null`.

---

## Portfólios (`/portfolios`)
Autenticado — **somente `owner`** (mesma regra de branding/equipe/planos).

Vitrine da agência, distinta da galeria de projeto
([Galeria pública do projeto](#galeria-pública-do-projeto)): uma coleção de
vídeos **e fotos** escolhida manualmente pelo owner (não espelha uma entrega
inteira), sem `status` de aprovação, com link público próprio para atrair
novos clientes (`/p/:linkPublico` no frontend). Um item entra de três
formas: (1) referenciando um vídeo já existente em algum projeto (sempre
vira um item `tipoMidia: "video"`), (2) upload de vídeo dedicado direto pro
portfólio, ou (3) upload de foto dedicada — nos dois últimos casos, sem
vínculo com projeto/cliente.

| Método | Rota | Body | Retorno |
|---|---|---|---|
| `GET` | `/portfolios` | — | `Portfolio[]` (sem `videos[]`, só resumo — ver abaixo) |
| `GET` | `/portfolios/:id` | — | `Portfolio` completo, com `videos[]` |
| `POST` | `/portfolios` | `{ nome, descricao?, categoriaId? }` | `Portfolio` criado (`linkPublico` gerado pelo backend) |
| `PATCH` | `/portfolios/:id` | `{ nome?, descricao?, categoriaId?, capaUrl?, clienteId? }` | `Portfolio` atualizado |
| `DELETE` | `/portfolios/:id` | — | `{ "deleted": true }` |

`Portfolio`: `{ id, nome, descricao, linkPublico, categoriaId, clienteId, capaUrl, videos: PortfolioItem[], criadoEm, atualizadoEm }`.
O campo continua se chamando `videos` mesmo agora que a lista mistura vídeo
e foto (nome já fechado com o frontend antes da foto entrar).

`categoriaId` referencia uma categoria do hub público (ver
[Portfólio: perfil e categorias](#portfólio-perfil-e-categorias-portfolio-profile-portfolio-categories)),
`null` = sem categoria (o álbum continua acessível pelo link direto, só não
aparece no hub). `400` se `categoriaId` não existir ou não pertencer à
conta do token.

`clienteId` (só em `PATCH`, nunca em `POST` — todo álbum novo nasce sem
cliente) etiqueta o álbum com a marca de um cliente específico (ver
[Marca própria do cliente](#marca-própria-do-cliente-clientsidbranding)) —
ex.: uma seleção de cases pra reapresentar a um prospect/cliente específico,
com a marca dele. Não tem relação com dono/criador do portfólio nem
restringe quem acessa o link público — é só sinalização de marca, que o
`GET /public/portfolios/:linkPublico` usa pra decidir se mostra o branding
do cliente. `null` remove a etiqueta; `400` se `clienteId` não existir ou
não pertencer à conta do token.

`capaUrl` pode ser setada explicitamente (ver `POST /portfolios/:id/cover-upload-url`
abaixo) — quando `null`/nunca setada, cai automaticamente no `posterUrl` do
primeiro item (por `ordem`), e `null` se o portfólio também não tem item
com poster gerado ainda. `PATCH .../:id { capaUrl: null }` remove a capa
explícita e volta pro fallback automático.

`linkPublico` é gerado a partir do `nome` no momento da criação (slug:
minúsculo, sem acento/pontuação, espaços viram `-`, até 40 caracteres —
ex.: `"Reels de Verão!"` → `reels-de-verao`; em colisão, ganha um sufixo
curto aleatório, ex.: `reels-de-verao-a1b2`). Fixo depois de criado —
renomear o portfólio (`PATCH /portfolios/:id`) **não** muda o link, pra não
quebrar um link já compartilhado. Ainda assim, opaco: o frontend não deve
assumir formato fixo (portfólios criados antes desta mudança mantêm o
link antigo em UUID).

`PortfolioItem`: `{ id, tipoMidia: "video" | "foto", titulo, descricao,
urlStorage (ou urlOtimizada, o que estiver pronto para tocar — sempre
`null` quando `tipoMidia: "foto"`), posterUrl, statusProcessamento, ordem,
criadoEm }`. Sem `status` de aprovação — não faz sentido fora do fluxo
cliente↔projeto.

Quando `tipoMidia: "foto"`: `posterUrl` é a própria foto em alta resolução
(usada tanto como thumbnail na grade pública quanto em tela cheia no
lightbox) — **não** existe pipeline de otimização/thumbnail separado pra
fotos, ao contrário de vídeo. `statusProcessamento` vem sempre `"pronto"`
nesse caso (não há processamento em background pra foto).

### `POST /portfolios/:id/videos`
Adiciona ao portfólio um vídeo **já existente** em algum projeto da conta
(`404` se `videoId` não existir ou não pertencer à conta; sempre
`tipoMidia: "video"` — não existe equivalente pra foto, já que o app não
tem um acervo de fotos fora do portfólio).

Body: `{ "videoId": "uuid", "titulo"?: "...", "descricao"?: "..." }`
`titulo`/`descricao` são opcionais — se omitidos, usa o `nomeArquivo` do
vídeo original como `titulo`.

O backend **copia** `urlStorage`/`urlOtimizada`/`posterUrl`/
`statusProcessamento`/`duracaoSegundos` do vídeo original pro item do
portfólio nesse momento (denormalizado, sem sincronização depois) — a rota
pública (`GET /public/portfolios/:linkPublico`) não resolve o
`Video`/projeto/cliente original por trás. Remover o item do portfólio
depois nunca afeta o vídeo original (ver `DELETE .../videos/:videoId`).

Resposta: o `Portfolio` completo atualizado (mesmo shape de `GET /portfolios/:id`).

### `POST /portfolios/:id/upload-url`
Presigned URL pro upload direto no R2, mesmo contrato de
`POST /videos/upload-url` (ver seção Vídeos) — só muda o path (pasta
`portfolio/` no bucket em vez de `videos/`). Agora também usado pra fotos:
`contentType` aceita, além dos tipos de vídeo já documentados, `image/png`,
`image/jpeg` e `image/webp`.

Body: `{ "nomeArquivo": "foto.jpg", "contentType": "image/jpeg" }`

Resposta `200`: `{ "uploadUrl": "...", "key": "...", "publicUrl": "...", "expiresIn": 600 }`

### `POST /portfolios/:id/videos/upload-complete`
Registra, direto no portfólio, um vídeo **ou foto** enviado pelo passo
acima — **sem** projeto/cliente por trás (diferente de `POST /videos`).
Pra vídeo, dispara em background a geração de poster + versão otimizada,
mesmo pipeline usado pelos vídeos de projeto (`statusProcessamento` começa
em `processando`). Pra foto, não há pipeline: o item já nasce
`statusProcessamento: "pronto"`.

Body: `{ "urlStorage": "<publicUrl do passo anterior>", "nomeArquivo": "video.mp4", "tipoMidia": "video" | "foto", "titulo"?: "...", "descricao"?: "..." }`
`titulo` opcional — se omitido, usa `nomeArquivo`. Quando `tipoMidia:
"foto"`, o backend grava `posterUrl = urlStorage` (a própria foto) e deixa
`urlStorage`/`urlOtimizada` do item como `null`.

Resposta: o `Portfolio` completo atualizado.

### `PATCH /portfolios/:id/videos/:videoId`
Edita título/descrição de um item (vídeo ou foto) já no portfólio.

Body: `{ "titulo"?: "...", "descricao"?: "..." }`

Resposta: o `Portfolio` completo atualizado.

### `DELETE /portfolios/:id/videos/:videoId`
Remove um item (vídeo ou foto) do portfólio (não afeta o vídeo original, se
veio de um projeto — só apaga os arquivos do R2 quando o item foi upload
dedicado). Resposta: o `Portfolio` completo atualizado.

### `PATCH /portfolios/:id/videos/order`
Reordena os itens do portfólio (usado pelos botões subir/descer na UI).

Body: `{ "videoIds": ["uuid1", "uuid2", "..."] }` — a nova ordem completa,
na sequência desejada (precisa conter exatamente os vídeos atuais do
portfólio, senão `400`). Resposta: o `Portfolio` completo atualizado, com
`ordem` de cada item recalculada a partir da posição no array.

### `POST /portfolios/:id/cover-upload-url`
Presigned URL **só de imagem** pra capa do álbum — mesmo padrão 2 passos de
`POST /portfolios/:id/upload-url`, mas **sem** passo de confirmação: a
`publicUrl` retornada aqui vai direto num `PATCH /portfolios/:id { capaUrl }`
(não existe um endpoint dedicado de "cover-complete").

Body: `{ "nomeArquivo": "capa.jpg", "contentType": "image/jpeg" }`
`contentType` aceita `image/png`, `image/jpeg` ou `image/webp`.

Resposta `200`: `{ "uploadUrl": "...", "key": "...", "publicUrl": "...", "expiresIn": 600 }`

Erros comuns em todas as rotas de `/portfolios`: `404` (portfólio/vídeo não
existe ou não pertence à conta do token), `403` (usuário não é `owner`).

---

## Portfólio: perfil e categorias (`/portfolio-profile`, `/portfolio-categories`)
Autenticado — **somente `owner`**. Camada acima dos álbuns individuais
([Portfólios](#portfólios-portfolios)): um **hub público único** da agência
(`/portfolio/:linkHub` no frontend) com foto de perfil e os álbuns
organizados em categorias livres (o owner cria as categorias do jeito que
quiser, ex.: "Casamento", "Institucional" — não são valores fixos). Os
links dos álbuns individuais (`/p/:linkPublico`) não mudam em nada — o hub
só lista cards que apontam pra eles (ver [Hub público do portfólio](#hub-público-do-portfólio)).

### `/portfolio-profile`

| Método | Rota | Body | Retorno |
|---|---|---|---|
| `GET` | `/portfolio-profile` | — | `PortfolioProfile` |
| `PATCH` | `/portfolio-profile` | `{ fotoUrl? }` | `PortfolioProfile` atualizado |
| `POST` | `/portfolio-profile/photo-upload-url` | `{ nomeArquivo, contentType }` | presigned URL |

`PortfolioProfile`: `{ fotoUrl, linkHub }`. `linkHub` é gerado
automaticamente pelo backend na **primeira leitura** (`GET` cria a linha se
ainda não existir) — nunca `null`, mesmo pra uma agência que nunca abriu
essa tela antes. Fixo depois de gerado.

`fotoUrl`: `null` limpa a foto, campo ausente deixa como está.

`POST /portfolio-profile/photo-upload-url`: presigned URL **só de imagem**
(`image/png`, `image/jpeg`, `image/webp`), mesmo padrão 2 passos **sem**
confirmação de `POST /portfolios/:id/cover-upload-url` — a `publicUrl`
retornada vai direto num `PATCH /portfolio-profile { fotoUrl }`.

Body: `{ "nomeArquivo": "perfil.jpg", "contentType": "image/jpeg" }`

Resposta `200`: `{ "uploadUrl": "...", "key": "...", "publicUrl": "...", "expiresIn": 600 }`

### `/portfolio-categories`

| Método | Rota | Body | Retorno |
|---|---|---|---|
| `GET` | `/portfolio-categories` | — | `PortfolioCategory[]` (por `ordem` crescente) |
| `POST` | `/portfolio-categories` | `{ nome }` | `PortfolioCategory` criada (entra no fim da lista) |
| `PATCH` | `/portfolio-categories/:id` | `{ nome?, ordem? }` | `PortfolioCategory` atualizada |
| `DELETE` | `/portfolio-categories/:id` | — | `{ "deleted": true }` |

`PortfolioCategory`: `{ id, nome, ordem, criadoEm, atualizadoEm }`. Livres —
o owner nomeia e ordena como quiser (não há reordenação em lote como em
`/portfolios/:id/videos/order`; ajuste `ordem` item a item via `PATCH`).

Excluir uma categoria (`DELETE`) **não apaga** os álbuns associados a ela —
só desassocia (`categoriaId: null` em cada `Portfolio` que apontava pra
ela). O álbum continua existindo e acessível pelo link direto, só some do
hub até ganhar outra categoria.

Erros comuns: `404` (categoria não existe ou não pertence à conta do
token), `403` (usuário não é `owner`).

---

## Comentários (canais autenticados)
Rotas sob `/videos/:id/comments`, onde `:id` é o `id` do vídeo (não o
`linkPublico`). Há dois canais isolados: **interno** (conversa da agência)
e **cliente** (resposta do owner ao comentário público do cliente).

| Método | Rota | Role | Body | Descrição |
|---|---|---|---|---|
| `GET` | `/videos/:id/comments/internal` | `owner`, `editor` | — | Lista o canal interno |
| `POST` | `/videos/:id/comments/internal` | `owner`, `editor` | `{ timestampVideo, texto, parentId? }` | Cria comentário interno (autor = usuário do token) |
| `POST` | `/videos/:id/comments/client-reply` | `owner` apenas | `{ timestampVideo, texto, parentId? }` | Resposta do owner ao cliente, no canal cliente |
| `DELETE` | `/videos/:id/comments/:commentId` | `owner`, `editor` | — | Exclui um comentário do canal **cliente** (moderação) |
| `POST` | `/videos/:id/comments/:commentId/move` | `owner`, `editor` | `{ videoDestinoId }` | Move um comentário do canal cliente para o canal interno de outro vídeo |

- `timestampVideo`: segundos (inteiro ≥ 0).
- `texto`: string não vazia, até 2000 caracteres.
- `parentId`: UUID opcional — precisa ser um comentário existente, **do
  mesmo vídeo e do mesmo canal** (senão `400`).
- `DELETE /videos/:id/comments/:commentId`: só apaga comentários do canal
  **cliente** (usado pra moderar o que o cliente escreveu) — `400` se o
  comentário for do canal interno. `404` se `:commentId` não existir ou não
  pertencer ao vídeo `:id`. `204 No Content` na resposta.
- `POST /videos/:id/comments/:commentId/move`: pega um comentário do canal
  cliente e recria no canal **interno** de `videoDestinoId` (mantendo
  `autorType: cliente`, pra preservar o badge "Cliente" na thread interna),
  apagando o original. `:commentId` precisa ser do canal cliente e
  pertencer ao vídeo `:id` (`404` se não existir/não for desse vídeo, `400`
  se não for do canal cliente). `videoDestinoId` precisa existir (`404`) e
  pertencer à mesma conta do token (`403` se for de outra agência). Retorna
  o comentário recriado (mesmo shape abaixo, já no canal `interno`).

Shape do comentário retornado:
```json
{
  "id": "uuid",
  "timestampVideo": 12,
  "texto": "Ajustar o áudio aqui",
  "channel": "interno",
  "autorType": "owner",
  "autorNome": null,
  "autorUserId": "uuid",
  "autorUser": { "id": "uuid", "nome": "Maria Silva", "teamRole": "owner" },
  "parentId": null,
  "criadoEm": "...",
  "isAgencyReply": false
}
```
`isAgencyReply` só é relevante no canal **cliente** — indica que a
mensagem é uma resposta do owner (para diferenciar visualmente da
mensagem original do cliente, que vem via
`POST /public/videos/:linkPublico/comments`).

> Os comentários do canal **cliente** (o cliente escrevendo, sem login) não
> têm um endpoint de listagem autenticado dedicado — eles aparecem dentro de
> `GET /public/videos/:linkPublico` (campo `comments`) e o front autenticado
> os lê por ali. `client-reply` só serve para o owner *responder*.

---

## Perguntas de avaliação (`/rating-questions`)

Substituem as antigas categorias fixas (`iluminacao`/`audio`/`enquadramento`)
— agora o owner define as próprias perguntas, exibidas ao cliente no
formulário de rating. **Toda conta nova já nasce com as 3 perguntas padrão**
(`Iluminação`, `Áudio`, `Enquadramento`, nessa ordem) — o owner edita, reordena,
desativa ou apaga livremente a partir daí.

| Método | Rota | Role | Body | Retorno |
|---|---|---|---|---|
| `GET` | `/rating-questions` | `owner`, `editor` | — | `RatingQuestion[]` (ordenado por `ordem`, inclui inativas) |
| `POST` | `/rating-questions` | `owner` | `{ texto }` | `RatingQuestion` criado (entra no fim da lista) |
| `PATCH` | `/rating-questions/:id` | `owner` | `{ texto?, ordem?, ativo? }` | `RatingQuestion` atualizado |
| `DELETE` | `/rating-questions/:id` | `owner` | — | `{ "deleted": true }` |

`RatingQuestion`: `{ id, accountId, texto, ordem, ativo, criadoEm }`.

- `ativo: false` tira a pergunta do formulário público
  (`GET /public/videos/:linkPublico` → `ratingQuestions`) sem apagar as
  avaliações já dadas — use isso para "aposentar" uma pergunta.
- `DELETE` só funciona se a pergunta **nunca recebeu avaliação** — retorna
  `409` pedindo para desativar (`ativo: false`) em vez de excluir quando já
  existe pelo menos um rating associado.
- Não existe endpoint de reordenação em lote — para reordenar, dá `PATCH`
  em cada pergunta com o novo `ordem`.

---

## Desempenho da equipe (`/team`)
Autenticado — **somente `owner`**.

### `GET /team/performance`
Exige `limits.teamPerformance` (plano `agencia`) — `403 Forbidden` nos
demais planos, mesmo chamando a API direto (o bloqueio não é só de UI).

Um item por editor (role `editor`) **com pelo menos um vídeo atribuído**
(via [`PATCH /videos/:id/editor-responsavel`](#patch-videosideditor-responsavel)),
independente do status desse vídeo.

Resposta:
```json
[
  {
    "editorId": "uuid",
    "nome": "Marina Alves",
    "avatarUrl": null,
    "notaMedia": 8.6,
    "videosAprovadosCount": 12,
    "faixa": "verde"
  }
]
```
- `videosAprovadosCount`: total de vídeos com `status: aprovado` atribuídos
  a esse editor (com ou sem `notaGeral`).
- `notaMedia`: média de `notaGeral` (1–5) apenas dos vídeos aprovados **que
  receberam nota geral na aprovação**, normalizada para escala **0–10**
  (`média × 2`, arredondada a 1 casa). `null` se nenhum vídeo aprovado desse
  editor tem `notaGeral` ainda.
- `faixa`: `sem_dados` (`notaMedia === null`) · `vermelho` (`< 4`) ·
  `laranja` (`4 ≤ x < 6`) · `amarelo` (`6 ≤ x < 8`) · `verde` (`≥ 8`).
- `avatarUrl`: sempre `null` hoje — este endpoint específico não lê o
  `fotoUrl` do usuário ainda (o upload em si já existe, ver seção
  [Perfil](#perfil-usersme)); placeholder para conectar futuramente.

---

## Conta / equipe (`/account`)

| Método | Rota | Auth | Body | Retorno |
|---|---|---|---|---|
| `POST` | `/account/invite` | `owner` | `{ email }` | `{ id, email, status, criadoEm, expiresAt, inviteUrl }` |
| `POST` | `/account/invite/:token/accept` | **sem autenticação** | `{ nome?, senha }` | `{ user, access_token }` |
| `POST` | `/account/invite/:id/send-email` | `owner` | — | `{ sent: true, expiresAt }` |
| `DELETE` | `/account/invite/:id` | `owner` | — | `204 No Content` |
| `GET` | `/account/members` | `owner` | — | `Member[]` |
| `PATCH` | `/account/members/:id/status` | `owner` | `{ status: "ativo" \| "suspenso" }` | `Member` atualizado |
| `PATCH` | `/account/members/:id/role` | `owner` | `{ teamRole: "owner" }` | `Member` atualizado |

- `invite`: cria convite pendente para um editor, com expiração em 3 dias
  (`expiresAt`, ISO 8601). `inviteUrl` é o link completo
  (`<CORS_ORIGIN>/convite/:token`) — hoje o envio de email é simulado (só
  loga no backend), então o frontend/owner precisa repassar esse link
  manualmente. `409` se convite **ainda válido** (`expiresAt` no futuro)
  pendente para o email (convite expirado é cancelado automaticamente e um
  novo é criado sem erro), ou se o email já é membro **ativo desta mesma
  conta**.
  > **Mudou (2026-08-11):** convidar um email que já tem conta em **outra**
  > agência agora funciona (antes dava `409` sempre) — ver
  > [Multi-conta](#multi-conta-1-pessoa-em-várias-agências). O aceite nesse
  > caso pede a senha existente da pessoa, não nome + senha nova (ver
  > `accept` abaixo).
- `accept`: fluxo público (tela `/convite/:token` no frontend). `:token` é
  o UUID do convite. Retorna token de sessão já logado, igual ao login —
  mas o body esperado **depende de o email do convite já ter conta ou não**
  (o backend decide sozinho, o frontend não precisa saber de antemão qual é
  o caso — só tentar com o que o usuário digitou):
  - **Email novo** (caso comum): `{ nome, senha }` — `nome` obrigatório,
    `senha` é a senha nova da conta que vai ser criada (mín. 6 caracteres).
    Cria o usuário `editor`.
  - **Email já tem conta (em qualquer agência)**: `{ senha }` — `nome` é
    ignorado se vier. `senha` aqui é a **senha atual** dessa conta, usada
    só pra confirmar identidade (não troca nem cria senha nova). Se
    confirmada, só cria o vínculo `editor` com a nova agência — não duplica
    usuário. `401` se a senha não bater. `400` se essa conta só tem login
    social (Google/Apple) e nunca teve senha local — mensagem pede pra
    definir uma via `/auth/forgot-password` antes de tentar de novo.
  - `404` se o convite já foi usado/não existe/foi cancelado. `410 Gone` se
    o convite existe e está `pendente` mas `expiresAt` já passou.
  - `user` na resposta inclui o branding da agência do convite
    (`logoUrl`/`corDestaque`/`nomeAgencia` soltos + `user.branding`), mesmo
    shape de `login`/`register` — ver nota em
    [`POST /auth/register`](#post-authregister).
- `cancelInvite`: `:id` é o id do convite (mesmo `id` retornado por
  `invite`). Só cancela convites com status `pendente` (`400` se já foi
  aceito/cancelado). `404` se o convite não existe ou não pertence à
  conta do owner autenticado.
- `sendInviteEmail`: envia (de verdade, via provedor transacional —
  Resend) o e-mail de convite para `invite.email`, com o mesmo `inviteUrl`
  retornado por `invite`. Renova `expiresAt` para +3 dias a partir de
  agora (mesmo se o convite anterior já tinha expirado — o novo link volta
  a ser válido). Só funciona com convite `pendente` (`409` se já foi
  aceito/cancelado). `404` se o convite não existe ou não pertence à
  conta do owner autenticado. `502` se o provedor falhar/recusar o envio.
  Limitado a 3 chamadas/minuto por IP (`@Throttle`) para evitar spam de
  reenvio. Sem `RESEND_API_KEY` configurada, o envio é simulado via log
  (mesmo padrão do `inviteUrl` simulado hoje).
- `members`: lista `owner` + `editores` da conta **e** os convites ainda
  `pendente` da conta (aceitos/cancelados não aparecem). Convites entram
  como `{ id: <id do convite>, nome: null, email, teamRole: "editor",
  status: "invited", criadoEm, expiresAt }` — o `id` é o mesmo usado em
  `DELETE /account/invite/:id` e `POST /account/invite/:id/send-email`. O
  backend não distingue "expirado" via status: o front compara
  `expiresAt` com a hora atual para decidir se mostra "pendente" ou
  "expirado" (convite expirado continua com `status: "invited"` até ser
  cancelado ou reenviado).
  `Member`: `{ id, nome, email, teamRole, status, criadoEm, expiresAt? }`
  — `expiresAt` só aparece nos itens com `status: "invited"`.
- `setMemberStatus`: uma conta pode ter mais de um `owner`. `editor` pode
  ser suspenso/reativado livremente. `owner` também pode ser suspenso,
  mas `400` se for o único `owner` ativo da conta (a conta nunca pode
  ficar sem nenhum owner ativo).
- `promoteMember` (rota `/role`): promove um `editor` a `owner`. Só
  suporta promoção (não dá pra rebaixar um `owner` de volta a `editor`
  por este endpoint). `400` se o membro já for `owner` ou se o editor
  estiver `suspenso`. `404` se o membro não existe/não pertence à conta.

### Sessões ativas (`/account/sessions`, `/account/members/:id/sessions`)

Toda autenticação bem-sucedida (`/auth/login`, `/auth/register`,
`/auth/google`, `/auth/apple`, aceite de convite) cria uma linha em
`Session` e o JWT emitido carrega o id dela na claim `sid`. O guard
confere a cada request que a sessão ainda existe — apagá-la (via os
endpoints abaixo) invalida o token imediatamente, mesmo antes de expirar
(7 dias).

| Método | Rota | Auth | Retorno |
|---|---|---|---|
| `GET` | `/account/sessions` | qualquer role | `Session[]` |
| `DELETE` | `/account/sessions/:id` | qualquer role | `204 No Content` |
| `DELETE` | `/account/sessions` | qualquer role | `204 No Content` |
| `GET` | `/account/members/:id/sessions` | `owner` | `Session[]` |
| `DELETE` | `/account/members/:id/sessions/:sessionId` | `owner` | `204 No Content` |
| `DELETE` | `/account/members/:id/sessions` | `owner` | `204 No Content` |

`Session`:
```json
{
  "id": "uuid",
  "dispositivo": "Chrome · macOS",
  "tipoDispositivo": "desktop",
  "localizacao": null,
  "ip": "187.54.12.201",
  "criadoEm": "2026-07-20T10:00:00.000Z",
  "ultimoAcessoEm": "2026-07-30T09:15:00.000Z",
  "atual": true
}
```
`dispositivo`/`tipoDispositivo` são derivados do User-Agent na hora da
resposta (`ua-parser-js`), não armazenados prontos. `localizacao` é
sempre `null` hoje (sem integração de geolocalização por IP). `atual` só
é calculado nas rotas da própria conta (`true` se `id` bate com a sessão
do token usado na request); nas rotas de `/account/members/:id/sessions`
é sempre `false` (nunca é a sessão de quem está chamando).

- `GET /account/sessions` / `DELETE /account/sessions/:id`: listam ou
  apagam uma sessão do próprio usuário autenticado. `404` se `:id` não
  existir ou não pertencer a ele — funciona mesmo se `:id` for a sessão
  atual (não é bloqueado no backend).
- `DELETE /account/sessions`: apaga todas as sessões do usuário, exceto a
  que fez esta própria requisição.
- `GET /account/members/:id/sessions` e as duas rotas `DELETE`
  correspondentes: só `owner`, agindo sobre as sessões do membro `:id`.
  `404` se `:id` não for membro da mesma conta/agência do owner
  autenticado. `DELETE .../sessions` (sem `:sessionId`) apaga todas as
  sessões daquele membro, sem exceção.

---

## Perfil (`/users/me`)
Autenticado — qualquer role (`owner`, `editor`, `admin`).

| Método | Rota | Body | Retorno |
|---|---|---|---|
| `GET` | `/users/me` | — | Perfil do usuário logado + branding da agência |
| `PATCH` | `/users/me` | `{ nome?, email?, fotoUrl? }` | `User` atualizado (shape de `/auth/login` + `fotoUrl`) |
| `POST` | `/users/me/photo-upload-url` | `{ nomeArquivo, contentType }` | `{ uploadUrl, key, publicUrl, expiresIn }` |

`GET /users/me` devolve:
```json
{
  "id": "...", "nome": "...", "email": "...", "teamRole": "owner", "status": "ativo", "accountId": "...", "fotoUrl": "...",
  "logoUrl": "...", "corDestaque": "#1E90FF", "nomeAgencia": "Agência Maria",
  "branding": { "logoUrl": "...", "corDestaque": "#1E90FF", "nomeAgencia": "Agência Maria" },
  "criadoEm": "...", "emailVerificado": true
}
```
Use este endpoint pra restaurar logo/cor/nome da agência num refresh de
página — o mesmo shape (`logoUrl`/`corDestaque`/`nomeAgencia` soltos e
agrupados em `branding`) já vem em
`register`/`login`/`google`/`apple`/`select-account`/
`account/invite/:token/accept`, então na maioria dos casos não precisa
chamar `GET /users/me` logo após o login — só útil pra refrescar o estado
num refresh de página (a sessão guardada no client não perde o objeto
`user` recebido no login).

Todos os campos do `PATCH` são opcionais — atualiza só o que vier no body.
Resposta:
```json
{ "id": "...", "nome": "...", "email": "...", "teamRole": "owner", "status": "ativo", "accountId": "...", "criadoEm": "...", "fotoUrl": "...", "emailVerificado": false }
```
Erros: `409` se o novo `email` já pertence a outra conta · `400` validação
(`nome` vazio, `email` inválido).

> Troca de email **não exige reautenticação** nesta v1 — o JWT identifica o
> usuário pelo `id` (não pelo `email`), então a sessão continua válida
> normalmente depois da troca. Trocar o email zera `emailVerificado`
> (o novo endereço ainda não foi confirmado) — o usuário precisa confirmar
> de novo via `POST /auth/resend-confirmation` + `POST /auth/confirm-email`.

`POST /users/me/photo-upload-url` gera uma presigned URL igual à do logo da
agência (ver seção abaixo), só que na pasta `avatars` (avatar pessoal, não
aparece pro cliente). `contentType` aceito: `image/png`, `image/jpeg`,
`image/webp`, `image/svg+xml`. Fluxo completo: `POST
/users/me/photo-upload-url` → `PUT` direto no R2 → `PATCH /users/me` com
`{ fotoUrl: publicUrl }`.

Troca de senha **não tem endpoint próprio** — reaproveita
`POST /auth/forgot-password` + `POST /auth/reset-password` (o botão "Alterar
senha" nas Configurações dispara o forgot-password pro próprio email do
usuário logado).

---

## Branding / white label (`/users/me`)
Autenticado — **somente `owner`**.

| Método | Rota | Body | Retorno |
|---|---|---|---|
| `POST` | `/users/me/branding/logo-upload-url` | `{ nomeArquivo, contentType }` | `{ uploadUrl, key, publicUrl, expiresIn }` |
| `PATCH` | `/users/me/branding` | `{ nome?, logoUrl?, corDestaque? }` | `{ id, nome, logoUrl, corDestaque, nomeAgencia }` |

`contentType` aceito: `image/png`, `image/jpeg`, `image/webp`,
`image/svg+xml`. Mesmo fluxo de presigned URL dos vídeos (`PUT` direto no
R2), só que na pasta `branding`. `corDestaque` é hex (`#RGB` ou `#RRGGBB`).
Esse branding (`logoUrl`/`corDestaque`/`nomeAgencia`) é o que aparece para o
**cliente** em `GET /public/videos/:linkPublico` (campo `agencia`).

> ⚠️ **Atenção ao nome do campo**: o body aceita `nome` para atualizar o
> **nome da agência** (`Account.nomeAgencia`) — mas a resposta devolve dois
> campos distintos: `nome` (nome **pessoal** do owner, já existia antes e
> não muda aqui) e `nomeAgencia` (o nome da agência, isso sim é o que
> `dto.nome` alterou). São conceitos diferentes que por coincidência usam o
> mesmo nome `nome` na entrada — não confundir os dois no front. `nomeAgencia`
> vem sempre no retorno (mesmo em um PATCH que só mexeu em `logoUrl`), então
> dá pra usar a resposta para refrescar o estado inteiro do branding.

---

## Planos (`/plans`)
Autenticado — `owner` ou `editor`.

| Método | Rota | Body | Retorno |
|---|---|---|---|
| `GET` | `/plans/me` | — | `{ plan, limits, usage }` |

```json
{
  "plan": "free",
  "limits": {
    "maxClients": 1,
    "maxTeamMembers": 1,
    "maxApprovalFilesPerMonth": 10,
    "maxPortfolioProjects": 6,
    "maxRatingQuestions": 3,
    "storageGb": 5,
    "publicPortfolio": true,
    "changeRequests": true,
    "clientApproval": true,
    "recordingManagement": "basic",
    "deliveryManagement": "basic",
    "contentCalendar": false,
    "clientArea": "basic",
    "publishContent": false,
    "reports": "none",
    "teamPerformance": false,
    "priorityProcessing": false,
    "prioritySupport": false,
    "whiteLabel": false
  },
  "usage": {
    "clients": 1,
    "teamMembers": 1,
    "approvalFilesThisMonth": 5,
    "portfolioProjects": 2,
    "ratingQuestions": 3
  }
}
```

Planos: `portfolio`, `free`, `pro`, `agencia`. `limits.*` numérico com valor
`null` significa ilimitado. `recordingManagement`/`deliveryManagement`/
`clientArea` valem `"none"|"basic"|"complete"`; `reports` vale
`"none"|"basic"|"advanced"` — hoje só `"none"` é de fato bloqueado no
backend (`PlansService.assertLevelFeature`), a diferença basic/complete/
advanced é só informativa pra UI. `storageGb` é só informativo (exibição na
UI) — não há enforcement de armazenamento hoje, pois o tamanho do arquivo
de vídeo não é persistido (mesma limitação descrita em `GET
/admin/metrics`). `contentCalendar`/`publishContent`/`deliveryManagement`/
`clientArea` também são só informativos hoje — não existe rota que
implemente esses recursos separadamente do resto.

A troca de plano fora do checkout (ex.: suporte) é manual, via `PATCH
/admin/accounts/:id/plan` (seção [Admin](#admin)). Toda conta nova começa
no plano `free`.

Ações bloqueadas pelo limite do plano respondem `403 Forbidden` com uma
mensagem explicando o limite atingido (ex: "Limite de 1 clientes do plano
free atingido..."). Isso acontece em:
- `POST /clients` — limite de clientes (`maxClients`)
- `POST /account/invite` — limite de membros (`maxTeamMembers`, conta
  owner(s) + editores + convites pendentes)
- `POST /videos` — limite de vídeos/arquivos no mês
  (`maxApprovalFilesPerMonth`; novas versões de um vídeo existente não
  contam)
- `POST /portfolios/:id/videos` e `POST /portfolios/:id/videos/upload-complete` —
  limite de itens no portfólio (`maxPortfolioProjects`, somado entre todos
  os portfólios da conta)
- `POST /rating-questions` — limite de perguntas (`maxRatingQuestions`)
- `POST /recording-events` — exige `recordingManagement` diferente de
  `"none"`
- `PATCH /users/me/branding` (quando envia `logoUrl` ou `corDestaque`) —
  exige `whiteLabel`
- `GET /projects/:id/report` — exige `reports` diferente de `"none"`
- `GET /team/performance` — exige `teamPerformance` (só plano `agencia`)

Contas com `priorityProcessing` no plano (hoje só `agencia`) também têm
prioridade na fila de processamento de vídeo (thumbnail/otimização) sobre
os demais planos.

---

## Pagamento (`/billing`)
Gateway: **Asaas Checkout** (página hospedada + Subscription). Assinatura
recorrente via cartão de crédito pra os planos `portfolio`/`pro`/`agencia`.
`free` não é assinável (é o padrão de toda conta nova).

| Método | Rota | Auth | Body | Retorno |
|---|---|---|---|---|
| `POST` | `/billing/checkout` | `owner` | `{ plan: "portfolio"\|"pro"\|"agencia", cycle: "MONTHLY"\|"YEARLY", cpfCnpj, phoneNumber, postalCode, address, addressNumber, complement?, province }` | `{ url }` |
| `POST` | `/billing/cancel` | `owner` | — | `{ plan: "free" }` |
| `POST` | `/billing/webhooks/asaas` | **sem autenticação** (verificado por token) | payload da Asaas | `{ received: true }` |

- `checkout`: cria uma sessão do **Asaas Checkout** com os dados do owner,
  `cpfCnpj` (só dígitos, 11 = CPF ou 14 = CNPJ), `phoneNumber` (DDD + 10 ou
  11 dígitos), `postalCode` (CEP), endereço, número, complemento opcional e
  bairro (`province`) e devolve a URL hospedada. O código IBGE da cidade é
  resolvido pelo backend a partir do CEP.
  O frontend deve **redirecionar** o usuário pra ela; a Asaas coleta o cartão
  de forma compatível com PCI e cria a assinatura recorrente apenas após a
  confirmação. Após a confirmação, a Asaas
  retorna para `<CORS_ORIGIN>/configuracoes/plano?status=sucesso`; o webhook
  continua sendo a fonte de verdade para ativar o plano. `502` se a Asaas estiver
  fora do ar ou a API key não estiver configurada.
- `cancel`: cancela a assinatura ativa na Asaas e já rebaixa a conta pra
  `free` na mesma hora (sem período de graça). `400` se a conta não tem
  assinatura ativa.
- `webhooks/asaas`: endpoint interno, chamado pela Asaas quando o status
  do pagamento muda — o frontend nunca chama isso diretamente. Ao
  contrário da Mercado Pago, o payload já vem completo (não precisa
  buscar o estado na API deles). Nos eventos `PAYMENT_CONFIRMED`/
  `PAYMENT_RECEIVED`, `Account.plan` é atualizado automaticamente;
  `GET /plans/me` reflete a mudança assim que o webhook é processado.
  `401` se o header `asaas-access-token` não bater com o token
  configurado no registro do webhook.

---

## Notificações (`/notifications`)
Autenticado — roles `owner`, `editor`. Escopado a `userId` + `accountId` do
token (nunca cruza contas ou usuários).

| Método | Rota | Query | Retorno |
|---|---|---|---|
| `GET` | `/notifications` | `?naoLidas=true` (opcional) | `Notification[]` (mais recentes primeiro, máx. 50) |
| `GET` | `/notifications/unread-count` | — | número (contagem de não lidas) |
| `PATCH` | `/notifications/:id/read` | — | `200`, corpo vazio |
| `PATCH` | `/notifications/read-all` | — | `200`, corpo vazio |

`Notification`:
```json
{
  "id": "uuid",
  "type": "comentario_cliente" | "aprovacao_cliente" | "ajuste_solicitado" | "avaliacao_cliente",
  "lida": false,
  "criadoEm": "...",
  "video": {
    "id": "uuid",
    "nomeArquivo": "video.mp4",
    "thumbnailUrl": "https://... ou null",
    "linkPublico": "aB3xQ9kZ2m",
    "project": { "nome": "Campanha Verão", "client": { "nome": "Cliente A" } }
  }
}
```

`Notification` do tipo `lembrete_gravacao` (ver abaixo) vem sem `video`, com
`event` no lugar (mesmo shape independente do destinatário ser owner ou um
membro da equipe escalado):
```json
{
  "id": "uuid",
  "type": "lembrete_gravacao",
  "lida": false,
  "criadoEm": "2026-08-06T10:00:00.000Z",
  "event": {
    "id": "uuid",
    "title": "Gravação — Batom matte (novo lançamento)",
    "startAt": "2026-08-06T12:00:00.000Z",
    "clientName": "Bela Cosméticos ou null"
  }
}
```

- São criadas automaticamente (nunca via endpoint próprio) quando o
  **cliente** comenta, aprova, pede ajuste ou avalia um vídeo — ver as
  rotas [públicas](#acesso-público-do-cliente-sem-autenticação). Destinatários:
  todos os `owner` da conta + o `editorResponsavel` do vídeo (se houver).
- `lembrete_gravacao`: gerada por um cron (`NotificationsService.sendRecordingReminders`,
  a cada 10min) quando um [`RecordingEvent`](#calendário-de-gravações-recording-events)
  está a até 24h do início (`dataInicio`). Destinatários: todo `owner` da
  conta (sempre) **+** cada pessoa da [`equipe`](#equipe-de-gravação-crew)
  escalada no evento que tiver `userId` preenchido (pode ser `owner` ou
  `editor`) — quem não tem `userId` (freelancer, motorista etc.) não recebe
  nada, não há conta pra notificar. Disparada uma única vez por
  destinatário/evento (índice único `recording_event_id/user_id/type` +
  `skipDuplicates` evitam duplicar a cada execução do cron ou entre pessoas
  adicionadas à equipe depois que o lembrete já saiu pros owners).
- `GET /notifications?naoLidas=true`: filtra só as não lidas. Sem o
  parâmetro (ou `naoLidas=false`), lista as 50 mais recentes independente
  do status de leitura.
- `PATCH /notifications/:id/read`: marca uma notificação como lida.
  Idempotente — não dá erro se já estava lida ou se `:id` não existir/não
  for do usuário (nesses casos simplesmente não atualiza nada, mas ainda
  responde `200`).
- `PATCH /notifications/read-all`: marca todas as não lidas do usuário
  como lidas.
- Criação é **best-effort**: se falhar (ex.: tabela indisponível), a ação
  do cliente que a disparou (comentário/aprovação/rating/ajuste) continua
  respondendo normalmente — a notificação simplesmente não é criada, sem
  quebrar o fluxo público.

---

## Calendário de gravações (`/recording-events`)
Autenticado — roles `owner`, `editor`. Escopado à `accountId` do token.

| Método | Rota | Body | Retorno |
|---|---|---|---|
| `POST` | `/recording-events` | `{ titulo, dataInicio, dataFim?, clienteId?, membroId?, equipeIds?, observacoes? }` | `RecordingEvent` criado |
| `GET` | `/recording-events` | — | `RecordingEvent[]` (ordenado por `dataInicio` asc) |
| `GET` | `/recording-events/:id` | — | `RecordingEvent` |
| `PATCH` | `/recording-events/:id` | mesmos campos do `POST`, todos opcionais | `RecordingEvent` atualizado |
| `DELETE` | `/recording-events/:id` | — | `{ "deleted": true }` |

`titulo` e `dataInicio` (ISO 8601) são obrigatórios no `POST`. `dataFim`,
`clienteId`, `membroId`, `equipeIds` e `observacoes` são opcionais/nuláveis
— a gravação pode ser lançada antes de definir cliente ou responsável.

`equipeIds` é um array de UUIDs de [`CrewMember`](#equipe-de-gravação-crew)
da mesma conta (pessoas da equipe escaladas pra essa gravação — freelancers,
motorista etc, não usuários do sistema). No `PATCH`, enviar `equipeIds`
**substitui a escala inteira** (não faz merge com a lista anterior); mandar
`equipeIds: []` limpa a escala. Omitir o campo mantém a escala atual.

`RecordingEvent`:
```json
{
  "id": "uuid",
  "titulo": "Gravação campanha verão",
  "dataInicio": "2026-08-10T13:00:00.000Z",
  "dataFim": "2026-08-10T15:00:00.000Z",
  "clienteId": "uuid ou null",
  "membroId": "uuid ou null",
  "observacoes": "Levar tripé extra",
  "clienteNome": "Cliente A",
  "membroNome": "João Editor",
  "equipe": [
    { "id": "uuid", "nome": "Maria Freelancer", "userId": null },
    { "id": "uuid", "nome": "Marina Alves", "userId": "uuid-do-user" }
  ]
}
```
`clienteNome`/`membroNome` vêm nulos se `clienteId`/`membroId` forem nulos.
`equipe` vem como array vazio (nunca nulo) quando não há ninguém escalado.
`equipe[].userId` vem nulo quando a pessoa não é vinculada a uma conta real
(ver [`/crew`](#equipe-de-gravação-crew)) — nesse caso ela não recebe o
lembrete de gravação (`lembrete_gravacao`), só aparece no card.

Erros: `400` se `clienteId` não corresponder a um `Client` da mesma conta,
`membroId` a um `User` (owner/editor) da mesma conta, ou algum item de
`equipeIds` a um `CrewMember` da mesma conta · `404` se `:id` do evento não
existir ou não pertencer à conta.

---

## Equipe de gravação (`/crew`)
Autenticado — roles `owner`, `editor`. Escopado à `accountId` do token.
Roster de pessoas que participam de gravações, usado pra escalar em
[`RecordingEvent.equipeIds`](#calendário-de-gravações-recording-events).
Reaproveitável entre eventos — a pessoa é cadastrada uma vez e escalada em
quantas gravações forem necessárias.

| Método | Rota | Body | Retorno |
|---|---|---|---|
| `POST` | `/crew` | `{ nome, userId? }` | `CrewMember` criado |
| `GET` | `/crew` | — | `CrewMember[]` da conta (ordenado por `nome` asc) |

`userId` é opcional e nulável: presente quando a pessoa escalada é uma
conta real da agência (`owner` ou `editor`), o que a torna elegível a
receber o lembrete de gravação (`lembrete_gravacao`, ver
[Notificações](#notificações-notifications)) quando escalada. Omitido/nulo
é o caso comum — gente sem login no Aprova (freelancer, motorista etc.).

`CrewMember`:
```json
{
  "id": "uuid",
  "nome": "Maria Freelancer",
  "userId": null,
  "accountId": "uuid",
  "criadoEm": "2026-08-11T12:00:00.000Z"
}
```

Erros: `400` se `userId` não corresponder a um `User` (`owner`/`editor`) da
mesma conta.

---

## Dashboard
Autenticado — roles `owner`, `editor`. Escopado à conta do token.

### `GET /dashboard/insights?horas_pendentes=48`
`horas_pendentes` é opcional (query, inteiro, padrão `48`) — janela para
considerar um vídeo pendente como "atrasado".

Resposta:
```json
{
  "periodoPendentesHoras": 48,
  "videosPendentesAtrasados": 3,
  "clienteAprovacaoMaisRapida": { "clientId": "uuid", "nome": "Cliente A", "tempoMedioHoras": 4.5, "amostras": 6 },
  "clienteAprovacaoMaisLenta": { "clientId": "uuid", "nome": "Cliente B", "tempoMedioHoras": 72.1, "amostras": 2 },
  "videosAprovadosNoMes": 14
}
```
`clienteAprovacaoMaisRapida`/`Lenta` podem vir `null` se ainda não há
nenhum vídeo aprovado na conta.

---

## Relatório do projeto (PDF)
Autenticado — roles `owner`, `editor`.

### `GET /projects/:id/report`
Não retorna JSON — é um download direto (`Content-Type: application/pdf`,
`Content-Disposition: attachment`). No frontend, tratar como blob:
```js
const res = await fetch(`/api/projects/${id}/report`, {
  headers: { Authorization: `Bearer ${token}` },
});
const blob = await res.blob();
// criar link de download a partir do blob
```
Conteúdo do PDF: nome do projeto/cliente, lista de vídeos (status +
versão), comentários por vídeo (com timestamp) e notas médias por
categoria.

---

## Acesso público do cliente (sem autenticação)

Identificador é sempre `linkPublico` do vídeo (ou do projeto, na galeria —
ver `/public/projects/:linkPublico`) — nunca o `id` interno. Rotas sob
`/public/videos/:linkPublico`. Nenhum dado interno da agência é exposto
(sem `deadline`, sem `editorId`, sem canal interno de comentários).

`linkPublico` é uma string opaca — o cliente (frontend) não deve assumir
formato ou tamanho fixo. Projetos/vídeos criados antes de 2026-07 recebem um
UUID v4 (36 caracteres); a partir dessa data, um id curto gerado
aleatoriamente (10 caracteres, url-safe — ver `src/common/short-id.util.ts`).
Ambos os formatos continuam resolvendo normalmente nas rotas públicas.

### Resolução de versão no canal público

Toda rota sob `/public/videos/:linkPublico` resolve a **cadeia de versões**
antes de qualquer coisa: a partir do vídeo daquele link, desce pelos filhos
(`videoPaiId`, ver [`POST /videos/:id/new-version`](#post-videosidnew-version))
e opera sempre sobre a **última versão** da cadeia.

Motivo: o link público é enviado ao cliente uma única vez. Antes, quando o
editor subia uma correção, o link que a cliente já tinha em mãos continuava
abrindo a versão antiga — na prática ela não via o ajuste, e era preciso
mandar um link novo a cada rodada. Agora qualquer link da família (o da v1
inclusive) abre a versão atual.

Isso vale para **todas** as rotas públicas do vídeo, não só o `GET`: o
comentário, o rating, o `approve`, o `request-changes` e o `PATCH /titulo`
enviados por um link antigo são gravados na última versão — que é a que o
cliente está vendo. Comentários e avaliações feitos nas versões anteriores
continuam presos aos respectivos vídeos: o histórico é preservado, só a tela
pública anda para a versão atual.

Cadeia com ramificação (duas novas versões criadas a partir do mesmo vídeo
pai — possível, mas fora do fluxo normal) é desempatada de forma
determinística: maior `versao`, depois a mais recente.

### `GET /public/projects/:linkPublico`
Sem rate limit específico (usa o global de 60/min). Entrada única da
galeria pública: lista todos os vídeos do projeto a partir de um só link,
pra o cliente não precisar entrar vídeo por vídeo.

Resposta:
```json
{
  "projeto": { "nome": "Campanha Verão" },
  "cliente": { "nome": "Cliente A", "branding": { "logoUrl": "https://... ou null", "corDestaque": "#d6336c ou null" } },
  "agencia": { "nome": "Agência Maria", "logoUrl": "https://... ou null", "corDestaque": "#1E90FF ou null" },
  "videos": [
    {
      "id": "uuid",
      "videoPaiId": "uuid ou null",
      "link": "abc123-...",
      "title": "video.mp4",
      "posterUrl": "https://... ou null",
      "status": "pendente" | "aprovado" | "ajuste" | "erro",
      "statusProcessamento": "processando" | "pronto" | "erro",
      "versao": 1
    }
  ]
}
```
`videos` vem ordenado por `criadoEm` crescente. Cada `link` é o
`linkPublico` do vídeo — o front navega pra
`GET /public/videos/:linkPublico` a partir dele (ver seção abaixo) pra
abrir o player/comentários/rating daquele vídeo específico. `id` e
`videoPaiId` espelham os mesmos campos de `GET /videos`: quando um vídeo
tem `videoPaiId` apontando pra outro `id` desta mesma lista, ele foi
substituído por uma versão mais nova (`POST /videos/:id/new-version`) — o
front usa isso pra esconder a versão antiga da galeria. `404` se
`:linkPublico` não corresponder a nenhum projeto.

> A galeria continua listando **todas** as versões (o filtro é do front, via
> `videoPaiId`). Mas o `link` de uma versão antiga não abre mais o vídeo
> antigo: ele entrega a última versão da cadeia — ver
> [Resolução de versão](#resolução-de-versão-no-canal-público).

`cliente.branding` é a marca própria do cliente deste projeto (ver
[Marca própria do cliente](#marca-própria-do-cliente-clientsidbranding)),
`null` quando o cliente não tem nenhuma marca própria configurada (caso
mais comum — cai só no branding da agência). Quando presente, o frontend
faz o merge campo a campo: `cliente.branding.logoUrl ?? agencia.logoUrl`,
`cliente.branding.corDestaque ?? agencia.corDestaque` (a marca do cliente
pode setar só o logo, só a cor, ou os dois).

### `POST /public/projects/:linkPublico/download`
Rate limit próprio: 20/min. Download **em lote** da entrega: monta um único
ZIP com os vídeos selecionados da galeria. Existe porque o Safari do iPhone
bloqueia vários downloads disparados a partir de um único toque — baixar
vídeo por vídeo não funciona no celular.

Corpo:
```json
{ "videoLinks": ["link-publico-1", "link-publico-2"] }
```
`videoLinks` são os `link` de `GET /public/projects/:linkPublico` (o
`linkPublico` de cada vídeo), no máximo **50** por request. Links repetidos
são ignorados; a ordem enviada é a ordem dos arquivos dentro do ZIP.

Resposta:
```json
{
  "url": "https://api.../api/public/projects/abc123/download/eJyr...VGRk",
  "filename": "entrega-campanha-verao.zip",
  "totalVideos": 2,
  "totalBytes": 734003200,
  "expiresIn": 900,
  "skipped": [{ "link": "link-publico-3", "reason": "processing" }]
}
```
Esta rota **não** devolve o ZIP: ela valida a seleção e devolve `url`, um
link temporário assinado (15 min) que o front abre num toque só
(`window.location.href = url`) pra disparar o download. `404` se
`:linkPublico` não corresponder a nenhum projeto.

Só entram no ZIP os vídeos **deste** projeto cujo arquivo original está
disponível no storage (confirmado no R2, não só pelo status do banco). Os
demais vêm em `skipped`, com `reason`:

| `reason` | Significado |
| --- | --- |
| `not_found` | O link não existe ou é de outro projeto |
| `processing` | Arquivo ainda indisponível e o vídeo está em processamento |
| `unavailable` | Arquivo original inacessível no storage |

> Um vídeo com `statusProcessamento: "processando"` **entra** no ZIP se o
> original já estiver no storage: o processamento gera thumbnail e versão
> otimizada, e o original é enviado antes disso. `processing` aparece só
> quando o arquivo realmente não está lá.

Quando nenhum dos vídeos pedidos está disponível, a resposta vem com
`"url": null`, `totalVideos: 0` e todos os links em `skipped` — o front
deve checar `url` antes de navegar.

### `GET /public/projects/:linkPublico/download/:token`
Rate limit próprio: 10/min. Transmite o ZIP (`Content-Type:
application/zip`, `Content-Disposition: attachment`). `:token` é o que vem
em `url` na rota acima — não é pra ser montado à mão. `404` se o token
estiver expirado, adulterado ou tiver sido emitido pra outro projeto.

O ZIP é transmitido em streaming, sem compressão (vídeo já é um formato
comprimido) e sem cópia intermediária em disco ou no R2 — por isso não há
`Content-Length` e o navegador mostra o download sem porcentagem. Dentro do
ZIP cada arquivo usa o título do vídeo (`nomeArquivo`) com a extensão do
original; títulos repetidos ganham sufixo (`Reels (2).mp4`).

### Portfólio público

### `GET /public/portfolios/:linkPublico`
Sem rate limit específico (usa o global de 120/min). Vitrine da agência (ver
[Portfólios](#portfólios-portfolios)) — **nenhum** dado de cliente/projeto/
status é exposto aqui, só o portfólio em si (e, quando aplicável, o
branding do cliente etiquetado — ver abaixo). `404` se `:linkPublico` não
corresponder a nenhum portfólio.

Resposta:
```json
{
  "nome": "Reels para redes sociais",
  "descricao": "Seleção de reels de curta duração... ou null",
  "cliente": { "branding": { "logoUrl": "https://... ou null", "corDestaque": "#d6336c ou null" } },
  "agencia": { "nome": "Agencia Teste", "logoUrl": "https://... ou null", "corDestaque": "#1E90FF ou null" },
  "videos": [
    { "id": "uuid", "tipoMidia": "video", "titulo": "Reel lançamento batom matte", "descricao": "... ou null", "urlStorage": "https://...", "posterUrl": "https://... ou null", "statusProcessamento": "pronto", "ordem": 0, "criadoEm": "..." },
    { "id": "uuid", "tipoMidia": "foto", "titulo": "Still campanha", "descricao": null, "urlStorage": null, "posterUrl": "https://...", "statusProcessamento": "pronto", "ordem": 1, "criadoEm": "..." }
  ]
}
```
`videos` vem ordenado por `ordem` crescente. `urlStorage` já resolve para a
versão otimizada quando pronta (mesma regra de `PortfolioItem` na seção
autenticada) — sempre `null` quando `tipoMidia: "foto"`. O frontend abre
cada item num lightbox — `<video>` nativo pra `tipoMidia: "video"`, a
imagem em tela cheia pra `tipoMidia: "foto"` — sem navegar para
`/v/:linkPublico` — a tela de aprovação do cliente não faz sentido aqui.

`cliente` só aparece (com `branding` preenchido) quando o álbum foi
etiquetado com um cliente (`Portfolio.clienteId`, ver `PATCH
/portfolios/:id`) que por sua vez tem marca própria configurada; caso
contrário vem `null`. Propositalmente **nunca** expõe `nome`/`id` do
cliente — essa rota é a vitrine pública, e não deve revelar pra quem o
álbum foi personalizado, só mudar a marca visual. Merge fica a cargo do
frontend, igual à galeria pública do projeto: `cliente.branding.logoUrl ??
agencia.logoUrl`, `cliente.branding.corDestaque ?? agencia.corDestaque`.

### Hub público do portfólio

### `GET /public/portfolio-hub/:linkHub`
Sem rate limit específico (usa o global de 120/min). Hub único da agência
(ver [Portfólio: perfil e categorias](#portfólio-perfil-e-categorias-portfolio-profile-portfolio-categories))
— foto de perfil + branding + álbuns organizados por categoria. `404` se
`:linkHub` não corresponder a nenhum hub.

Resposta:
```json
{
  "fotoUrl": "https://... ou null",
  "agencia": { "nome": "Agencia Teste", "logoUrl": "https://... ou null", "corDestaque": "#1E90FF ou null" },
  "categorias": [
    {
      "id": "uuid",
      "nome": "Casamento",
      "portfolios": [
        { "id": "uuid", "nome": "Reels para redes sociais", "descricao": "... ou null", "link": "reels-de-verao", "capaUrl": "https://... ou null", "tipoMidiaPredominante": "video" }
      ]
    }
  ]
}
```
`categorias` vem ordenado por `ordem` crescente; cada `portfolios[]` vem
mais recente primeiro. Cada item de `portfolios[]` é um resumo do álbum
(sem `videos[]`) — `link` é o `linkPublico` do portfólio, o frontend navega
pra `GET /public/portfolios/:linkPublico` a partir dele pra abrir o álbum
completo. `capaUrl` já resolve o mesmo fallback da versão autenticada
(posterUrl do primeiro item quando nenhuma capa explícita foi setada).

`tipoMidiaPredominante` (`"video"` | `"foto"`) é o tipo de mídia majoritário
entre os itens do álbum (maioria simples por contagem de `tipoMidia`) — em
caso de empate (incluindo álbum sem nenhum item, o que não deveria
acontecer aqui já que álbuns vazios são filtrados), cai para `"video"`.
Serve pro filtro categoria → foto/vídeo → álbuns do hub público.

Só aparecem categorias com **pelo menos um álbum com item** — categoria
vazia (sem álbuns, ou só com álbuns ainda sem nenhum vídeo/foto) é filtrada
no backend e não aparece na resposta. Álbuns sem `categoriaId` (nenhuma
categoria atribuída) nunca aparecem aqui, mesmo tendo itens — eles só são
acessíveis pelo link direto `/p/:linkPublico`.

### `GET /public/videos/:linkPublico`
Sem rate limit específico (usa o global de 60/min).

Resposta:
```json
{
  "id": "uuid",
  "linkPublico": "abc123-...",
  "latestVersionId": "uuid",
  "resolvedFromVersion": 1,
  "nomeArquivo": "video.mp4",
  "urlStorage": "https://...",
  "urlOtimizada": "https://... ou null (ainda processando)",
  "thumbnailUrl": "https://... ou null",
  "statusProcessamento": "processando" | "pronto" | "erro",
  "versao": 1,
  "status": "pendente" | "aprovado" | "ajuste" | "erro",
  "notaGeral": null,
  "criadoEm": "...",
  "projeto": { "nome": "Campanha Verão" },
  "cliente": { "nome": "Cliente A", "descricao": "... ou null", "fotoUrl": "https://... ou null" },
  "agencia": { "nome": "Agência Maria", "logoUrl": "https://... ou null", "corDestaque": "#1E90FF ou null" },
  "comments": [
    { "id": "...", "timestampVideo": 12, "texto": "... ou null (comentário só de áudio)", "audioUrl": "https://... ou null", "autorType": "cliente", "autorNome": "Fulano", "autorUser": null, "parentId": null, "criadoEm": "...", "isAgencyReply": false }
  ],
  "ratings": [
    { "id": "...", "ratingQuestionId": "uuid", "nota": 4, "criadoEm": "..." }
  ],
  "ratingQuestions": [
    { "id": "uuid", "texto": "Iluminação", "ordem": 0 },
    { "id": "uuid", "texto": "Áudio", "ordem": 1 },
    { "id": "uuid", "texto": "Enquadramento", "ordem": 2 }
  ],
  "queue": [
    { "link": "abc123-...", "title": "video.mp4", "posterUrl": "https://... ou null", "status": "pendente" }
  ]
}
```

- **Sempre responde a última versão da cadeia**, mesmo que `:linkPublico`
  seja o de uma versão antiga (ver
  [Resolução de versão](#resolução-de-versão-no-canal-público)). Todos os
  campos do vídeo (`id`, `urlStorage`, `versao`, `status`, `comments`,
  `ratings`, ...) são os da versão entregue.
  - `linkPublico`: link **canônico** da versão entregue. Pode ser diferente
    do link da URL acessada — use este para comparar com `queue[].link`.
  - `latestVersionId`: id da versão entregue (igual a `id`; explícito para
    auditoria/log do front).
  - `resolvedFromVersion`: número da versão do link que o cliente acessou.
    Quando é igual a `versao`, o link já era o da última versão; quando é
    menor, o link era antigo e foi resolvido para frente.
- `comments` aqui é **só o canal cliente** (a conversa que o cliente vê
  com o owner). `isAgencyReply: true` marca as respostas do owner.
- `ratingQuestions`: as perguntas de avaliação **ativas** da agência dona
  deste vídeo, ordenadas por `ordem` — é o formulário de rating a
  renderizar (substitui as antigas categorias fixas). Perguntas com
  `ativo: false` (ver [`/rating-questions`](#perguntas-de-avaliação-rating-questions))
  não aparecem aqui, mesmo que já tenham `ratings` associados.
- `ratings`: avaliações já enviadas para este vídeo; `ratingQuestionId`
  referencia um item de `ratingQuestions` (ou uma pergunta já desativada,
  que por isso não aparece mais em `ratingQuestions`).
- `notaGeral`: nota geral (1–5) dada pelo cliente ao aprovar (ver abaixo);
  `null` se ainda não aprovado ou se aprovou sem informar nota.
- `queue`: usado pela navegação estilo "Reels" (swipe entre vídeos).
  Contém **todos** os vídeos do **mesmo projeto** deste vídeo (não do
  cliente inteiro — escopo deliberadamente restrito ao projeto, pra não
  misturar entregas antigas de outros projetos do mesmo cliente),
  **incluindo o vídeo atual**, ordenados por data de criação (crescente,
  estável entre chamadas). O frontend localiza a posição atual com
  `queue.findIndex(item => item.link === linkPublico)` (o `linkPublico` da
  resposta, **não** o da URL acessada — se o cliente entrou por um link de
  versão antiga, os dois são diferentes) para navegar prev/next — sempre vai
  existir um match porque o vídeo atual está na lista. A fila ainda inclui
  versões antigas como itens separados; cada uma delas abre a última versão
  da respectiva cadeia. Cada item tem só `link`, `title`, `posterUrl`, `status` (nada de
  dados internos da agência) — equivalente ao item de `videos` da galeria
  do projeto, mas sem `statusProcessamento`/`versao`.

### `POST /public/videos/:linkPublico/comments/audio-upload-url`
Rate limit: **20/min**.

Body: `{ "nomeArquivo": "comentario-1712345678.webm", "contentType": "audio/webm" }`
(`contentType` deve ser um de: `audio/webm`, `audio/ogg`, `audio/mp4`,
`audio/mpeg`, `audio/wav`)

Resposta: `{ uploadUrl, key, publicUrl, expiresIn }` — mesmo mecanismo do
[`POST /videos/upload-url`](#post-videosupload-url): o front faz `PUT`
direto em `uploadUrl` com o binário do áudio, depois manda `publicUrl`
como `audioUrl` no `POST .../comments` abaixo. `404` se `:linkPublico`
não existir.

### `POST /public/videos/:linkPublico/comments`
Rate limit: **20/min**.

Body: `{ "timestampVideo": 12, "texto": "...", "autorNome": "Fulano", "audioUrl": "https://... (opcional)" }`
(`texto` até 2000 chars, `autorNome` até 120 chars obrigatório, `audioUrl`
opcional — URL pública retornada pelo upload acima). `texto` e `audioUrl`
são ambos opcionais, mas **pelo menos um dos dois é obrigatório** — o
microfone é uma alternativa ao campo de texto, não um complemento
obrigatório (`400` se os dois vierem vazios).

Cria comentário no canal cliente (autor = cliente, sem login). Resposta
inclui `texto` (pode vir `null`) e `audioUrl` (`null` se não houver áudio).

### `POST /public/videos/:linkPublico/ratings`
Rate limit: **20/min**.

Body: `{ "ratingQuestionId": "uuid", "nota": 1 }`
(`ratingQuestionId` deve vir de `ratingQuestions` do `GET` deste mesmo
vídeo; `nota` inteiro de 1 a 5). `404` se a pergunta não existe ou não
pertence à mesma agência do vídeo.

> Mudança de contrato: antes era `{ categoria: "iluminacao" | "audio" |
> "enquadramento", nota }`. As categorias fixas deixaram de existir —
> agora é sempre `ratingQuestionId`, dinâmico por agência.

### `POST /public/videos/:linkPublico/approve`
Rate limit: **10/min**. Marca `status = aprovado` e carimba `aprovadoEm`.
Também avança `etapaProducao` (board Kanban interno) para `aprovado` —
ver [`PATCH /videos/:id/etapa`](#patch-videosidetapa).

Body (opcional): `{ "notaGeral": 5 }` (inteiro 1–5). Se enviado, é salvo em
`Video.notaGeral` e passa a valer no [desempenho da equipe](#desempenho-da-equipe-team)
do editor responsável por este vídeo. Pode aprovar sem enviar nada
(`{}` ou corpo vazio) — nesse caso `notaGeral` permanece `null`.

### `POST /public/videos/:linkPublico/request-changes`
Rate limit: **10/min**. Sem body. Marca `status = ajuste` e avança
`etapaProducao` para `ajustes`.

### `PATCH /public/videos/:linkPublico/titulo`
Rate limit: **10/min**. Sem autenticação — o cliente renomeia o vídeo pela
tela pública dele.

Body: `{ "nomeArquivo": "novo-nome.mp4" }`

---

## Admin
Autenticado — **somente role `admin`**.

| Método | Rota | Body | Retorno |
|---|---|---|---|
| `GET` | `/admin/users` | — | lista de agências (owners) com contagens |
| `PATCH` | `/admin/users/:id/status` | `{ status: "ativo" \| "suspenso" }` | usuário atualizado |
| `GET` | `/admin/metrics` | — | métricas gerais da plataforma |
| `GET` | `/admin/videos/errors` | — | vídeos com `statusProcessamento = erro` |
| `POST` | `/admin/videos/:id/reprocess` | — | reenfileira thumbnail + versão otimizada |
| `PATCH` | `/admin/accounts/:id/plan` | `{ plan: "portfolio" \| "free" \| "pro" \| "agencia" }` | `{ id, nomeAgencia, plan }` |

`GET /admin/users` → cada item:
```json
{ "id": "...", "nome": "...", "email": "...", "status": "ativo", "criadoEm": "...", "account": { "id": "...", "nomeAgencia": "...", "_count": { "clients": 3, "projects": 5, "users": 2 } } }
```

`GET /admin/metrics`:
```json
{
  "users": { "total": 40, "profissionais": 30, "admins": 1, "suspensos": 2 },
  "videos": {
    "total": 500,
    "porStatus": { "pendente": 100, "aprovado": 350, "ajuste": 40, "erro": 10 },
    "porProcessamento": { "processando": 3, "pronto": 490, "erro": 7 }
  },
  "storage": { "estimadoBytes": 26214400000, "estimadoGb": 24.41, "observacao": "Estimativa por contagem (~50MB/video); tamanho real nao e armazenado." }
}
```
(storage é estimado — o tamanho real do arquivo não é persistido, já que o
upload vai direto pro R2)

> `porStatus` é o workflow de aprovação do cliente (pendente/aprovado/ajuste);
> `porProcessamento` é o pipeline de thumbnail/otimização (processando/pronto/erro).
> São campos independentes do `Video` — um vídeo `porStatus.pendente` pode
> estar `porProcessamento.erro` ao mesmo tempo.

`GET /admin/videos/errors` → vídeos com falha no processamento (thumbnail/
versão otimizada não gerados). Cada item inclui `project.account.users[0]`
(o owner responsável, para contato) e `statusProcessamento`.

`POST /admin/videos/:id/reprocess` → reenfileira o processamento de um
vídeo travado em `statusProcessamento = erro` (reseta para `processando`
e dispara o job de novo). `409` se o vídeo não estiver em erro no momento;
`404` se o vídeo não existe. Resposta: `{ "id", "statusProcessamento": "processando" }`.
O original em `urlStorage` nunca é afetado — apenas thumbnail/otimizado são
regenerados.

`PATCH /admin/accounts/:id/plan` → `:id` é o `Account.id` (não o id do
usuário/owner — ver `account.id` em `GET /admin/users`). Troca manual de
plano — fallback do fluxo real de assinatura (ver [Pagamento](#pagamento-billing)).
`404` se a conta não existe.

---

## Health check
### `GET /health`
Sem autenticação, sem rate limit. Usado por orquestradores/load balancer.
`200 { "status": "ok" }` ou `503` se o banco estiver indisponível.

---

## Fluxo de upload de vídeo

1. `POST /videos/upload-url` → recebe `uploadUrl` (presigned, expira em 10
   min) e `publicUrl`.
2. Frontend faz `PUT <uploadUrl>` com o arquivo binário direto no R2
   (`Content-Type` igual ao enviado no passo 1). **Não** passa pelo
   backend.
3. `POST /videos` com `urlStorage = publicUrl` do passo 1 → registra no
   banco, gera `linkPublico` e dispara thumbnail/otimização em background.
4. Compartilha `linkPublico` com o cliente
   (`https://<seu-dominio>/v/:linkPublico` ou o formato de rota que o
   front usar) → ele acessa via `GET /public/videos/:linkPublico`.

Mesmo padrão vale para o logo da agência
(`POST /users/me/branding/logo-upload-url` → `PUT` → `PATCH
/users/me/branding`).

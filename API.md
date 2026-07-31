# API do Vistoow — Guia para o Frontend

Referência completa de todos os endpoints do backend: como autenticar, o que
enviar e o que esperar de volta. Gerado a partir do código-fonte em
2026-07-06 — se algo aqui divergir do comportamento real, o código
(`src/**/*.controller.ts`, `src/**/dto/*.dto.ts`) é a fonte da verdade.

## Sumário

- [Convenções gerais](#convenções-gerais)
- [Autenticação](#autenticação)
- [Clientes](#clientes-clients)
- [Projetos](#projetos-projects)
- [Vídeos](#vídeos-videos)
- [Comentários (canais autenticados)](#comentários-canais-autenticados)
- [Perguntas de avaliação](#perguntas-de-avaliação-rating-questions)
- [Desempenho da equipe](#desempenho-da-equipe-team)
- [Conta / equipe (convites e membros)](#conta--equipe-account)
- [Perfil](#perfil-usersme)
- [Branding / white label](#branding--white-label-users)
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
  "user": { "id": "...", "nome": "Maria Silva", "email": "maria@agencia.com", "teamRole": "owner", "status": "ativo", "accountId": "...", "criadoEm": "..." },
  "access_token": "eyJhbGciOi..."
}
```
Erros: `409` se já existe conta com o email.

### `POST /auth/login`
Sem autenticação. Rate limit: **5/min**.

Body: `{ "email": "...", "senha": "..." }`

Resposta `200`: mesmo shape de `register` (`{ user, access_token }`).

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

Resposta `200`: mesmo shape de `register`/`login` (`{ user, access_token }`).

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

Resposta `200`: mesmo shape de `register`/`login`.

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

---

## Clientes (`/clients`)
Autenticado — roles `owner`, `editor`.

| Método | Rota | Body | Retorno |
|---|---|---|---|
| `POST` | `/clients` | `{ nome, email }` | `Client` criado |
| `GET` | `/clients` | — | `Client[]` (ordenado por `nome`) |
| `GET` | `/clients/:id` | — | `Client` |
| `PATCH` | `/clients/:id` | `{ nome?, email? }` | `Client` atualizado |
| `DELETE` | `/clients/:id` | — | `{ "deleted": true }` |

`Client`: `{ id, nome, email, accountId, isExemplo }`. Deletar um cliente
apaga em cascata seus projetos e vídeos (histórico não é recuperável).
Erros: `404` se o cliente não existe ou não pertence à conta.

---

## Projetos (`/projects`)
Autenticado — roles `owner`, `editor`.

| Método | Rota | Body | Retorno |
|---|---|---|---|
| `POST` | `/projects` | `{ nome, clientId }` | `Project` criado |
| `GET` | `/projects` | — | `Project[]` (com `client: { id, nome }`, mais recente primeiro) |
| `GET` | `/projects/:id` | — | `Project` (com `client: { id, nome }`) |
| `PATCH` | `/projects/:id` | `{ nome?, clientId? }` | `Project` atualizado |
| `DELETE` | `/projects/:id` | — | `{ "deleted": true }` |

`clientId` deve ser UUID de um cliente da mesma conta (`400` caso contrário).
Deletar um projeto apaga em cascata seus vídeos.

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

### `GET /videos?project_id=<uuid>`
Lista os vídeos de um projeto (mais recente primeiro por versão).

Resposta: array de `Video` + `videoPai: { id, versao, nomeArquivo } | null`
+ `_count: { comments, ratings, versoes }`.

### `PATCH /videos/:id/status`
Body: `{ "status": "pendente" | "aprovado" | "ajuste" | "erro" }`
Ao marcar `aprovado`, o backend carimba `aprovadoEm`.

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

## Comentários (canais autenticados)
Rotas sob `/videos/:id/comments`, onde `:id` é o `id` do vídeo (não o
`linkPublico`). Há dois canais isolados: **interno** (conversa da agência)
e **cliente** (resposta do owner ao comentário público do cliente).

| Método | Rota | Role | Body | Descrição |
|---|---|---|---|---|
| `GET` | `/videos/:id/comments/internal` | `owner`, `editor` | — | Lista o canal interno |
| `POST` | `/videos/:id/comments/internal` | `owner`, `editor` | `{ timestampVideo, texto, parentId? }` | Cria comentário interno (autor = usuário do token) |
| `POST` | `/videos/:id/comments/client-reply` | `owner` apenas | `{ timestampVideo, texto, parentId? }` | Resposta do owner ao cliente, no canal cliente |

- `timestampVideo`: segundos (inteiro ≥ 0).
- `texto`: string não vazia, até 2000 caracteres.
- `parentId`: UUID opcional — precisa ser um comentário existente, **do
  mesmo vídeo e do mesmo canal** (senão `400`).

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
| `POST` | `/account/invite` | `owner` | `{ email }` | `{ id, email, status, criadoEm, inviteUrl }` |
| `POST` | `/account/invite/:token/accept` | **sem autenticação** | `{ nome, senha }` | `{ user, access_token }` |
| `POST` | `/account/invite/:id/send-email` | `owner` | — | `{ sent: true }` |
| `DELETE` | `/account/invite/:id` | `owner` | — | `204 No Content` |
| `GET` | `/account/members` | `owner` | — | `Member[]` |
| `PATCH` | `/account/members/:id/status` | `owner` | `{ status: "ativo" \| "suspenso" }` | `Member` atualizado |
| `PATCH` | `/account/members/:id/role` | `owner` | `{ teamRole: "owner" }` | `Member` atualizado |

- `invite`: cria convite pendente para um editor. `inviteUrl` é o link
  completo (`<CORS_ORIGIN>/convite/:token`) — hoje o envio de email é
  simulado (só loga no backend), então o frontend/owner precisa repassar
  esse link manualmente. `409` se já existe usuário ou convite pendente
  para o email.
- `accept`: fluxo público (tela `/convite/:token` no frontend). `:token` é
  o UUID do convite. Cria o usuário `editor` e retorna token de sessão já
  logado, igual ao login. `404` se o convite já foi usado/não existe.
- `cancelInvite`: `:id` é o id do convite (mesmo `id` retornado por
  `invite`). Só cancela convites com status `pendente` (`400` se já foi
  aceito/cancelado). `404` se o convite não existe ou não pertence à
  conta do owner autenticado.
- `sendInviteEmail`: envia (de verdade, via provedor transacional —
  Resend) o e-mail de convite para `invite.email`, com o mesmo `inviteUrl`
  retornado por `invite`. Só funciona com convite `pendente` (`409` se já
  foi aceito/cancelado). `404` se o convite não existe ou não pertence à
  conta do owner autenticado. `502` se o provedor falhar/recusar o envio.
  Limitado a 3 chamadas/minuto por IP (`@Throttle`) para evitar spam de
  reenvio. Sem `RESEND_API_KEY` configurada, o envio é simulado via log
  (mesmo padrão do `inviteUrl` simulado hoje).
- `members`: lista `owner` + `editores` da conta.
  `Member`: `{ id, nome, email, teamRole, status, criadoEm }`.
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
| `PATCH` | `/users/me` | `{ nome?, email?, fotoUrl? }` | `User` atualizado (shape de `/auth/login` + `fotoUrl`) |
| `POST` | `/users/me/photo-upload-url` | `{ nomeArquivo, contentType }` | `{ uploadUrl, key, publicUrl, expiresIn }` |

Todos os campos do `PATCH` são opcionais — atualiza só o que vier no body.
Resposta:
```json
{ "id": "...", "nome": "...", "email": "...", "teamRole": "owner", "status": "ativo", "accountId": "...", "criadoEm": "...", "fotoUrl": "..." }
```
Erros: `409` se o novo `email` já pertence a outra conta · `400` validação
(`nome` vazio, `email` inválido).

> Troca de email **não exige reautenticação** nesta v1 — o JWT identifica o
> usuário pelo `id` (não pelo `email`), então a sessão continua válida
> normalmente depois da troca.

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

### `GET /public/videos/:linkPublico`
Sem rate limit específico (usa o global de 60/min).

Resposta:
```json
{
  "id": "uuid",
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
  "cliente": { "nome": "Cliente A" },
  "agencia": { "nome": "Agência Maria", "logoUrl": "https://... ou null", "corDestaque": "#1E90FF ou null" },
  "comments": [
    { "id": "...", "timestampVideo": 12, "texto": "...", "autorType": "cliente", "autorNome": "Fulano", "autorUser": null, "parentId": null, "criadoEm": "...", "isAgencyReply": false }
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
- `queue`: usado pela navegação estilo "Reels" (swipe entre vídeos do
  mesmo cliente). Contém **todos** os vídeos do cliente dono deste vídeo,
  **incluindo o vídeo atual**, ordenados por data de criação (crescente,
  estável entre chamadas). O frontend localiza a posição atual com
  `queue.findIndex(item => item.link === linkPublicoAtual)` para navegar
  prev/next — sempre vai existir um match porque o vídeo atual está na
  lista. Cada item tem só `link`, `title`, `posterUrl`, `status` (nada de
  dados internos da agência).

### `POST /public/videos/:linkPublico/comments`
Rate limit: **20/min**.

Body: `{ "timestampVideo": 12, "texto": "...", "autorNome": "Fulano" }`
(`texto` até 2000 chars, `autorNome` até 120 chars, ambos obrigatórios)

Cria comentário no canal cliente (autor = cliente, sem login).

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

Body (opcional): `{ "notaGeral": 5 }` (inteiro 1–5). Se enviado, é salvo em
`Video.notaGeral` e passa a valer no [desempenho da equipe](#desempenho-da-equipe-team)
do editor responsável por este vídeo. Pode aprovar sem enviar nada
(`{}` ou corpo vazio) — nesse caso `notaGeral` permanece `null`.

### `POST /public/videos/:linkPublico/request-changes`
Rate limit: **10/min**. Sem body. Marca `status = ajuste`.

---

## Admin
Autenticado — **somente role `admin`**.

| Método | Rota | Body | Retorno |
|---|---|---|---|
| `GET` | `/admin/users` | — | lista de agências (owners) com contagens |
| `PATCH` | `/admin/users/:id/status` | `{ status: "ativo" \| "suspenso" }` | usuário atualizado |
| `GET` | `/admin/metrics` | — | métricas gerais da plataforma |
| `GET` | `/admin/videos/errors` | — | vídeos com `status = erro` |

`GET /admin/users` → cada item:
```json
{ "id": "...", "nome": "...", "email": "...", "status": "ativo", "criadoEm": "...", "account": { "id": "...", "nomeAgencia": "...", "_count": { "clients": 3, "projects": 5, "users": 2 } } }
```

`GET /admin/metrics`:
```json
{
  "users": { "total": 40, "profissionais": 30, "admins": 1, "suspensos": 2 },
  "videos": { "total": 500, "porStatus": { "pendente": 100, "aprovado": 350, "ajuste": 40, "erro": 10 } },
  "storage": { "estimadoBytes": 26214400000, "estimadoGb": 24.41, "observacao": "Estimativa por contagem (~50MB/video); tamanho real nao e armazenado." }
}
```
(storage é estimado — o tamanho real do arquivo não é persistido, já que o
upload vai direto pro R2)

`GET /admin/videos/errors` → cada item inclui `project.account.users[0]`
(o owner responsável, para contato).

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

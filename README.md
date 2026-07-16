# Vistoow — Backend

Sistema de aprovação de vídeos entre profissionais de marketing e seus clientes.

O profissional faz login (JWT), cadastra clientes/projetos e envia vídeos.
Cada vídeo ganha um `link_publico` (UUID) que o cliente acessa **sem senha**
para comentar (com timestamp), avaliar por categoria e aprovar / pedir ajuste.

## Stack

- **NestJS** (Node.js)
- **PostgreSQL** + **Prisma** ORM
- **JWT** (autenticação apenas do profissional)
- **Cloudflare R2** (S3-compatible) com **presigned URL** — o vídeo vai direto
  do navegador para o bucket, sem passar pelo servidor.
- **BullMQ + Redis** — fila assíncrona para o processamento de vídeo
  (thumbnail + versão otimizada).
- **ffmpeg** embutido via `ffmpeg-static`/`ffprobe-static` (não exige ffmpeg
  instalado no sistema).
- **pdfmake** — geração de relatórios em PDF.
- **Swagger** — documentação interativa em `/api/docs`.

## Setup

```bash
# 1. Instalar dependências
npm install

# 2. Configurar variáveis de ambiente
cp .env.example .env
# edite .env com DATABASE_URL, credenciais do R2 e JWT_SECRET

# 3. Gerar o Prisma Client
npm run prisma:generate

# 4. Aplicar as migrations no banco
npm run prisma:deploy      # produção (aplica migrations existentes)
# ou, em desenvolvimento:
npm run prisma:migrate     # cria/aplica migrations interativamente

# 5. Subir um Redis (necessário para a fila de processamento de vídeo)
#    ex.: docker run -p 6379:6379 redis:7-alpine

# 6. Rodar
npm run start:dev
```

A API sobe em `http://localhost:3000/api` e o Swagger em
`http://localhost:3000/api/docs`.

### Via Docker

```bash
cp .env.example .env
# edite .env com DATABASE_URL (opcional aqui, veja abaixo), credenciais do
# R2 e JWT_SECRET - o resto tem default para rodar local

docker compose up --build
```

O `docker-compose.yml` sobe Postgres e Redis, roda as migrations (serviço
`migrate`, via `prisma migrate deploy`) e só então inicia a API (serviço
`app`). `DATABASE_URL`/`REDIS_HOST`/`REDIS_PORT` já são sobrescritos no
compose para apontar para os serviços internos (`postgres`, `redis`); as
demais variáveis (R2, JWT_SECRET etc.) vêm do `.env`.

O `Dockerfile` é multi-stage (`deps` → `build` → `migrate` / `prod-deps` →
`runtime`) e gera uma imagem final sem devDependencies, rodando como usuário
não-root. Para rodar só a imagem de produção (ex.: atrás de um orquestrador
que já cuida de Postgres/Redis):

```bash
docker build -t vistoow-backend --target runtime .
docker run --env-file .env -p 3000:3000 vistoow-backend
```

> `docker compose up --build` foi validado fim-a-fim (build, migrations,
> `/api/health`, registro de conta e onboarding). O build baixa os binários
> do `ffmpeg-static`/`ffprobe-static` e gera o engine do Prisma durante o
> build, então exige acesso à internet.

> **Processamento de vídeo:** ao registrar um vídeo, um job é enfileirado no
> Redis. O mesmo processo Nest roda o worker (BullMQ), que baixa o original do
> R2, gera a **thumbnail** e uma **versão otimizada** para streaming, sobe ambos
> no R2 e atualiza `status_processamento` (`processando` → `pronto` / `erro`).
> Sem Redis a API continua funcionando: o registro do vídeo não falha, apenas
> o processamento não ocorre (o original permanece disponível).

## Variáveis de ambiente

| Variável | Descrição |
|---|---|
| `DATABASE_URL` | String de conexão do PostgreSQL |
| `JWT_SECRET` | Segredo para assinar os tokens JWT |
| `JWT_EXPIRES_IN` | Expiração do token (padrão `7d`) |
| `R2_ACCOUNT_ID` | Account ID da Cloudflare |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | Credenciais S3 do R2 |
| `R2_BUCKET_NAME` | Nome do bucket |
| `R2_ENDPOINT` | Endpoint S3 do R2 (`https://<account_id>.r2.cloudflarestorage.com`) |
| `R2_PUBLIC_URL` | Domínio público do bucket para servir os vídeos |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` | Conexão do Redis (fila BullMQ). Padrão `127.0.0.1:6379`, senha opcional |
| `DEMO_VIDEO_URL` / `DEMO_THUMBNAIL_URL` | Asset de demonstração usado no vídeo de exemplo do onboarding |
| `RESEND_API_KEY` | Chave da API do Resend, usada para reenviar o e-mail de convite. Sem ela, o envio é apenas simulado via log |
| `MAIL_FROM` | Remetente usado no envio de e-mail transacional (padrão `Vistoow <no-reply@aprova.app>`) |
| `PORT` | Porta do servidor (padrão `3000`) |
| `CORS_ORIGIN` | Origem(ns) do frontend, separadas por vírgula |

## Endpoints

Todos sob o prefixo `/api`.

Papéis (`role`): **profissional** (padrão) e **admin**. Contas têm `status`
`ativo`/`suspenso` — conta suspensa não faz login nem usa o token.

### Autenticação
- `POST /auth/register` — `{ nome, email, senha, role? }` → `{ user, access_token }`
  (`role` é opcional, padrão `profissional`; permite semear um admin)
- `POST /auth/login` — `{ email, senha }` → `{ user, access_token }`
  (o token carrega `role`; retorna 403 se a conta estiver suspensa)
- `POST /auth/forgot-password` — `{ email }` → `{ sent: true }`. Sempre
  retorna a mesma resposta (nunca revela se o email existe). Se existir,
  envia por email (Resend, ou simulado via log sem `RESEND_API_KEY`) um
  link com token de reset válido por 1h.
- `POST /auth/reset-password` — `{ token, novaSenha }` → `{ reset: true }`.
  Token é de uso único; ao ser consumido, invalida quaisquer outros tokens
  pendentes do mesmo usuário.

### Clientes (autenticado, role `profissional` — header `Authorization: Bearer <token>`)
- `POST /clients` — `{ nome, email }`
- `GET /clients`
- `GET /clients/:id`
- `PATCH /clients/:id`
- `DELETE /clients/:id`

### Projetos (autenticado, role `profissional`)
- `POST /projects` — `{ nome, clientId }`
- `GET /projects`
- `GET /projects/:id`
- `PATCH /projects/:id`
- `DELETE /projects/:id`

### Vídeos (autenticado, role `profissional`)
- `POST /videos/upload-url` — `{ nomeArquivo, contentType }` → `{ uploadUrl, key, publicUrl, expiresIn }`
  O frontend faz `PUT` do arquivo direto na `uploadUrl` (R2).
- `POST /videos` — `{ projectId, urlStorage, nomeArquivo, versao? }` — registra
  o vídeo após o upload; gera `link_publico`. Se `versao` não for enviada,
  o backend calcula a próxima versão do projeto. **Dispara em background** a
  geração de `thumbnail_url` + `url_otimizada`; `status_processamento` começa
  em `processando` e vira `pronto`/`erro`.
- `POST /videos/:id/new-version` — `{ urlStorage, nomeArquivo }` — sobe nova
  versão vinculada ao vídeo anterior via `video_pai_id`, herdando o projeto e
  incrementando a versão. Os comentários/notas da versão anterior permanecem
  na versão pai (histórico preservado).
- `GET /videos?project_id=<uuid>` — lista os vídeos do projeto, com o `videoPai`
  de cada versão e contagens (comentários, notas, versões filhas).
- `PATCH /videos/:id/status` — `{ status: pendente | aprovado | ajuste | erro }`.

### Acesso público do cliente (SEM autenticação)
Identificador é sempre o `link_publico` do vídeo. Nenhum dado de outros
vídeos/projetos é exposto — apenas o nome do projeto e do cliente **deste**
vídeo (para a legenda do "Preview Reels").
- `GET /public/videos/:linkPublico` — dados do vídeo (inclui `thumbnailUrl`,
  `urlOtimizada`, `statusProcessamento`) + `projeto.nome` + `cliente.nome` +
  `agencia` (`nome`, `logoUrl`, `corDestaque` — para o logo/white label e as
  Open Graph tags) + comentários + ratings.
- `POST /public/videos/:linkPublico/comments` — `{ timestampVideo, texto, autorNome }`
- `POST /public/videos/:linkPublico/ratings` — `{ categoria, nota }` (nota 1–5)
- `POST /public/videos/:linkPublico/approve` — marca como `aprovado`.
- `POST /public/videos/:linkPublico/request-changes` — marca como `ajuste`.

### Dashboard (autenticado, role `profissional`, escopado ao usuário)
- `GET /dashboard/insights?horas_pendentes=48` — retorna:
  `videosPendentesAtrasados` (pendentes há mais que o período configurável),
  `clienteAprovacaoMaisRapida` / `clienteAprovacaoMaisLenta` (menor/maior tempo
  médio do envio do link até a aprovação) e `videosAprovadosNoMes`.

### Relatório do projeto (autenticado, role `profissional`)
- `GET /projects/:id/report` — gera e baixa um **PDF** com nome do projeto/cliente,
  lista de vídeos (status + versão), comentários agrupados por vídeo (com
  timestamp) e notas médias por categoria. Download direto (`application/pdf`).

### Branding / white label (autenticado, role `profissional`)
- `POST /users/me/branding/logo-upload-url` — `{ nomeArquivo, contentType }` →
  presigned URL (R2, pasta `branding`) para o `PUT` do logo.
- `PATCH /users/me/branding` — `{ logoUrl?, corDestaque? }` (hex, ex.: `#1E90FF`)
  — salva o branding da agência (exposto no acesso público do cliente).

### Onboarding
No `POST /auth/register`, após criar a conta, o backend cria em background um
**Cliente Exemplo**, um **Projeto Exemplo** e um **Vídeo de exemplo** (com
comentários e notas fake). Essas entidades vêm com `is_exemplo = true` para o
frontend identificar e o usuário poder deletá-las (basta deletar o cliente —
projeto e vídeos são removidos em cascata).

### Admin (autenticado, role `admin`)
- `GET /admin/users` — lista todos os profissionais (com contagem de clientes/projetos).
- `PATCH /admin/users/:id/status` — `{ status: ativo | suspenso }` — suspende/reativa conta.
- `GET /admin/metrics` — contagens gerais: usuários (por role/status), vídeos
  (por status) e storage estimado (~50MB/vídeo, pois o tamanho real não é armazenado).
- `GET /admin/videos/errors` — lista vídeos com `status = erro`.

## Fluxo de upload de vídeo

1. `POST /videos/upload-url` → recebe `uploadUrl` (presigned) e `publicUrl`.
2. Frontend faz `PUT` do arquivo binário na `uploadUrl` (direto no R2).
3. `POST /videos` com `urlStorage = publicUrl` → registra no banco e gera o link.
4. Compartilha `link_publico` com o cliente.

## Estrutura

```
src/
├── main.ts                 # bootstrap, CORS, ValidationPipe, filtro global
├── app.module.ts
├── common/filters/         # AllExceptionsFilter (erros padronizados + Prisma)
├── prisma/                 # PrismaService global
├── storage/                # StorageService (R2 / presigned URLs)
├── auth/                   # register, login, JWT strategy, RolesGuard + @Roles
├── clients/                # CRUD de Client (escopo do usuário, role profissional)
├── projects/               # CRUD de Project (escopo do usuário, role profissional)
├── media/                  # MediaService (ffmpeg: thumbnail + otimização), global
├── videos/                 # upload-url, registro, versionamento, listagem, status
│   └── processing/         # fila BullMQ: service (enqueue) + worker (processor)
├── public/                 # rotas do cliente (sem auth) + comments/ratings
├── dashboard/              # insights do profissional (escopado ao usuário)
├── reports/                # PdfService + geração do relatório de projeto (PDF)
├── users/                  # branding/white label da agência (logo + cor)
└── admin/                  # users, métricas, suspensão, vídeos com erro (role admin)
```

## Autorização por role

- `JwtAuthGuard` valida o token e popula `request.user` (rejeita conta suspensa).
- `RolesGuard` + `@Roles(UserRole.x)` restringem por papel.
- Controllers de client/project/video: `@Roles(profissional)`; controller admin:
  `@Roles(admin)`. Todas as consultas de client/project/video são filtradas pelo
  `user_id` do token — um profissional nunca acessa dado de outro.

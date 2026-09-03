# AGENTS.md

Notas para quem (agente ou humano) for continuar o trabalho da **central do
cliente** (`/clientes/:id` no frontend) — histórico de auditoria e arquivos
operacionais do cliente. Escrito ao final da sessão que implementou isso,
em 2026-08-12.

## Contexto rápido

- Projeto: Vistoow backend (NestJS + Prisma + PostgreSQL). Aprovação de
  vídeos entre agências e clientes finais.
- Branch: `master`. HEAD local: `47636b5 feat: historico de auditoria e
  arquivos operacionais do cliente` — **commit só local, nunca foi dado
  `git push`**.
- Pedido original: o frontend fechou uma central por cliente que junta
  visão geral, projetos, conteúdos, aprovações, calendário e histórico.
  Faltavam dois blocos no backend para fechar de ponta a ponta: trilha de
  auditoria e arquivos operacionais. O calendário tinha pedido próprio
  (não faz parte deste trabalho). O plano completo aprovado pelo usuário
  está em `~/.claude/plans/keen-beaming-turtle.md` (detalha cada decisão
  de design com mais contexto do que este arquivo).

## O que foi implementado

1. **Trilha de auditoria (`ClientActivity`)** — model append-only +
   `ClientActivityService` (`src/client-activity/`). Gravação automática
   (nunca manual pelo frontend) nos seguintes pontos:
   - `video_enviado` — `VideosService.create()`
   - `nova_versao` — `VideosService.createNewVersion()`
   - `aprovacao_cliente` / `ajuste_solicitado` — `PublicService.setStatus()`
     (usado por `approve()`/`requestChanges()`)
   - `comentario_cliente` — `PublicService.addComment()`
   - `resposta_agencia` — `CommentsService.clientReply()`
   - `arquivo_enviado` / `arquivo_removido` — `ClientFilesService`
   - Rota de leitura: `GET /clients/:id/activity?cursor=&limit=` (cursor
     pagination, `criadoEm desc`, limit default 30, teto 100).

2. **Arquivos operacionais (`ClientFile`)** — model + módulo
   `src/client-files/` completo: briefing/contrato/referência/roteiro/
   outro. Rotas sob `/clients/:id/files` (owner/editor apenas):
   `GET /`, `POST /upload-url`, `POST /`, `PATCH /:fileId`,
   `DELETE /:fileId`. Mesmo fluxo de presigned URL do R2 usado nos
   vídeos; `tamanhoBytes` sempre calculado no servidor (nunca confiado
   do cliente). **Nunca exposto em rota pública** — não existe nenhum
   caminho de código sob `PublicModule` que toque `ClientFile`.

3. **Migration hand-written**
   `prisma/migrations/20260812160000_add_client_activity_and_files/migration.sql`
   — verificada rodando `prisma migrate diff` schema-a-schema (sem tocar
   banco) e confirmando que bate com o que o Prisma geraria.

4. **`.env.example`** — documentação sobre `CORS_ORIGIN` aceitar múltiplas
   origens separadas por vírgula (o código já suportava isso, só
   documentei o formato e o que mudar no Railway).

## O que ainda falta

- **`GET /clients/:id/overview`** (endpoint consolidado) — adiado por
  decisão explícita do usuário. É "nice to have", não bloqueia o
  frontend (ele já monta a central com as rotas existentes).
- **CORS no Railway** — não é mudança de código. O usuário precisa
  adicionar `http://localhost:3000` (e/ou `http://127.0.0.1:3000`) na
  env var `CORS_ORIGIN` do serviço no Railway para testar o frontend
  local contra o backend deployado.
- **`git push`** — o commit `47636b5` está só local. Não foi enviado ao
  remoto nesta sessão.
- **Migration não aplicada em produção** — só roda quando o deploy
  disparar `prisma migrate deploy` (ou alguém rodar manualmente). Não
  fizemos isso nesta sessão.
- **`nota_atualizada`** — existe no enum `ClientActivityType` mas nunca é
  emitido. Reservado para uma futura feature de "nota interna do
  cliente" que ainda não existe no produto.

## Decisões técnicas tomadas

- **Migration à mão, não `prisma migrate dev`**: o shadow DB deste
  projeto está quebrado (memória do projeto: "duplicate avatar_url
  migration breaks migrate dev shadow-db") e esse já é o padrão do repo
  — outras migrations recentes (ex.: `20260811130000_add_membership_multi_tenant`,
  `20260812150000_add_google_calendar_sync`) também foram escritas à mão.
- **`ClientActivityService.log()` é best-effort**, no mesmo molde de
  `NotificationsService.notify()`: sempre `try/catch` + `Logger.error`,
  nunca propaga. A trilha de auditoria não pode derrubar a ação
  principal (upload, aprovação etc.) que já foi persistida.
- **`ClientFile.tamanhoBytes` sempre calculado no servidor** via
  `StorageService.headObject()`, nunca confiado do valor enviado pelo
  cliente — mesmo padrão de `VideosService.validateUploadedFile`.
- **Overview e CORS ficaram fora do escopo** por decisão explícita do
  usuário (perguntado via pergunta direta antes de implementar).
- **`clientReply` sempre loga `atorTipo: owner`** porque a rota já é
  restrita a owner via `RolesGuard`/`@Roles`.
- **Cursor pagination** usa o padrão nativo do Prisma
  (`cursor: { id }, skip: 1`), não offset/page.

## Problemas conhecidos / cuidado

- **O working tree tinha (e ainda tem) outra feature em andamento, não
  commitada**: Google Calendar sync (`src/google-calendar/`,
  `src/common/crypto.util.ts`,
  `prisma/migrations/20260812150000_add_google_calendar_sync/`, mudanças
  em `src/recording-events/*`, e partes de `.env.example`/
  `schema.prisma`/`app.module.ts`). **Isso não faz parte deste
  trabalho** e não foi commitado — está intacto no working tree, só
  pendente. Rode `git status`/`git diff` para ver o estado atual antes
  de mexer nisso.
- Como as duas features tocam os mesmos três arquivos
  (`.env.example`, `prisma/schema.prisma`, `src/app.module.ts`), o
  commit `47636b5` exigiu separar manualmente os hunks (reconstruindo o
  conteúdo "só meu" a partir do HEAD anterior, staging, e restaurando o
  working tree completo depois). Os diffs staged vs. working tree foram
  conferidos linha a linha antes do commit — mas vale conferir de novo
  com `git log -p 47636b5 -- prisma/schema.prisma` se algo parecer
  estranho.
- **Sem infraestrutura de testes** (zero arquivos jest/spec no repo).
  Verificação é só compilação (`tsc --noEmit`) + leitura manual.
- **`DATABASE_URL` sempre aponta para produção** — não há
  staging/dev DB separado. Qualquer `prisma migrate deploy` real afeta
  produção diretamente.
- **`npm run lint` (com `--fix`) reformata o repo inteiro via
  Prettier**, incluindo arquivos fora do escopo da tarefa. Isso
  aconteceu nesta sessão (`account.service.ts`, `admin.service.ts`,
  `auth.service.ts` foram reformatados sem necessidade e revertidos).
  Sempre rodar `git diff --stat` depois do lint e reverter o que não é
  seu.
- **`npm run build` foi bloqueado algumas vezes pelo classifier de auto
  mode** desta sessão (motivo não totalmente claro — pode ser algo
  específico do ambiente/sessão). Alternativa que funcionou:
  `npx tsc --noEmit -p tsconfig.json`.

## Arquivos importantes

| Arquivo | O que tem |
|---|---|
| `prisma/schema.prisma` | Models `ClientActivity`, `ClientFile` + enums `ClientActivityType`/`ClientActivityAtorTipo`/`ClientFileCategoria` |
| `prisma/migrations/20260812160000_add_client_activity_and_files/migration.sql` | Migration hand-written correspondente |
| `src/client-activity/client-activity.service.ts` | `log()` best-effort + `findByClient()` cursor pagination |
| `src/client-activity/client-activity.module.ts` | Exporta o service, importado por Clients/Videos/Comments/Public/ClientFiles |
| `src/client-files/` | Módulo completo (controller/service/dto) dos arquivos operacionais |
| `src/clients/clients.controller.ts` / `clients.service.ts` | Rota `GET :id/activity` |
| `src/clients/dto/list-client-activity-query.dto.ts` | DTO da query (`cursor`, `limit`) |
| `src/videos/videos.service.ts` | Hooks `video_enviado` (`create`) e `nova_versao` (`createNewVersion`) |
| `src/public/public.service.ts` | Hooks `aprovacao_cliente`/`ajuste_solicitado` (`setStatus`) e `comentario_cliente` (`addComment`) |
| `src/comments/comments.service.ts` | Hook `resposta_agencia` (`clientReply`) |
| `src/app.module.ts` | Registro de `ClientActivityModule` e `ClientFilesModule` |
| `.env.example` | Doc de `CORS_ORIGIN` multi-origem |
| `~/.claude/plans/keen-beaming-turtle.md` | Plano completo aprovado pelo usuário — mais contexto por trás de cada decisão |

## Próximos passos

1. Se o usuário pedir: `git push` do commit `47636b5` para o remoto
   (`master`) — ainda não foi feito.
2. Confirmar no deploy (Railway) que `prisma migrate deploy` roda
   automaticamente e que a migration `20260812160000_...` aplica sem
   conflito com a `20260812150000_add_google_calendar_sync` (que vem
   antes na ordem cronológica do nome, se/quando aquela feature também
   for commitada).
3. Se o usuário quiser: implementar `GET /clients/:id/overview`
   (adiado por decisão explícita — ver plano salvo).
4. Lembrar o usuário de atualizar `CORS_ORIGIN` no Railway com as
   origens locais, se for testar o frontend local contra o backend
   deployado.
5. Avisar o time de frontend que `GET /clients/:id/activity` e
   `/clients/:id/files/*` estarão disponíveis assim que o deploy subir.
6. Se for retomar a feature de Google Calendar (não relacionada a este
   trabalho), o working tree já tem tudo pronto, só não commitado —
   conferir `git status` antes de continuar.

## Comandos para rodar/testar o projeto

Setup completo:

```bash
npm install
cp .env.example .env   # editar DATABASE_URL, credenciais R2, JWT_SECRET etc.
npm run prisma:generate
npm run prisma:deploy  # aplica migrations pendentes — CUIDADO: aponta pra produção, ver "Problemas conhecidos"
npm run start:dev      # API em http://localhost:3000/api, Swagger em /api/docs
```

Verificação sem tocar no banco (o que foi usado nesta sessão):

```bash
npx prisma validate
npx prisma generate
npx tsc --noEmit -p tsconfig.json   # alternativa segura a `npm run build` se ele for bloqueado
npm run lint                         # CUIDADO: --fix reformata o repo inteiro — revisar `git diff --stat` depois
```

Conferir uma migration hand-written contra o schema, sem tocar no banco:

```bash
git show HEAD:prisma/schema.prisma > /tmp/schema-before.prisma
npx prisma migrate diff \
  --from-schema-datamodel /tmp/schema-before.prisma \
  --to-schema-datamodel prisma/schema.prisma \
  --script
```

Não existe suíte de testes automatizados no repo (zero jest/spec) —
verificação é compilação + leitura manual do diff/migration.

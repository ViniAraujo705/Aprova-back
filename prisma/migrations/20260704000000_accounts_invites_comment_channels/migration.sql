-- Migration: contas multi-usuario (owner/editor), convites e canais de comentario.
-- Inclui migracao de dados: cria um Account para cada User existente,
-- reaponta clients/projects para a conta e converte "profissional" em "owner".

-- gen_random_uuid() (core no PG13+, mas garantimos a extensao)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('pendente', 'aceito', 'cancelado');

-- CreateEnum
CREATE TYPE "CommentChannel" AS ENUM ('cliente', 'interno');

-- CreateEnum
CREATE TYPE "CommentAuthorType" AS ENUM ('owner', 'editor', 'cliente');

-- AlterEnum: UserRole { profissional, admin } -> { admin, owner, editor }
-- Converte os "profissional" existentes em "owner" via USING.
CREATE TYPE "UserRole_new" AS ENUM ('admin', 'owner', 'editor');
ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "role" TYPE "UserRole_new"
  USING (
    CASE "role"::text
      WHEN 'profissional' THEN 'owner'
      ELSE "role"::text
    END
  )::"UserRole_new";
ALTER TYPE "UserRole" RENAME TO "UserRole_old";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
DROP TYPE "UserRole_old";
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'owner';

-- CreateTable: accounts
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "nome_agencia" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable: invites
CREATE TABLE "invites" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" "InviteStatus" NOT NULL DEFAULT 'pendente',
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invites_pkey" PRIMARY KEY ("id")
);

-- ============================================================
-- MIGRACAO DE DADOS: uma conta por usuario existente
-- ============================================================

-- users.account_id (nullable durante o backfill)
ALTER TABLE "users" ADD COLUMN "account_id" TEXT;

-- Cria um account por user e liga user.account_id ao account criado.
-- MATERIALIZED garante que os UUIDs gerados sejam os mesmos no INSERT e no
-- UPDATE (a CTE e avaliada uma unica vez).
WITH mapped AS MATERIALIZED (
  SELECT "id" AS user_id,
         gen_random_uuid()::text AS account_id,
         "nome",
         "criado_em"
  FROM "users"
), inserted AS (
  INSERT INTO "accounts" ("id", "nome_agencia", "criado_em")
  SELECT account_id, COALESCE(NULLIF("nome", ''), 'Agencia'), "criado_em"
  FROM mapped
  RETURNING "id"
)
UPDATE "users" u
SET "account_id" = m.account_id
FROM mapped m
WHERE u."id" = m.user_id;

-- Agora account_id e obrigatorio
ALTER TABLE "users" ALTER COLUMN "account_id" SET NOT NULL;

-- clients: user_id -> account_id
ALTER TABLE "clients" ADD COLUMN "account_id" TEXT;
UPDATE "clients" c
SET "account_id" = u."account_id"
FROM "users" u
WHERE c."user_id" = u."id";
ALTER TABLE "clients" ALTER COLUMN "account_id" SET NOT NULL;
ALTER TABLE "clients" DROP CONSTRAINT "clients_user_id_fkey";
DROP INDEX "clients_user_id_idx";
ALTER TABLE "clients" DROP COLUMN "user_id";

-- projects: user_id -> account_id
ALTER TABLE "projects" ADD COLUMN "account_id" TEXT;
UPDATE "projects" p
SET "account_id" = u."account_id"
FROM "users" u
WHERE p."user_id" = u."id";
ALTER TABLE "projects" ALTER COLUMN "account_id" SET NOT NULL;
ALTER TABLE "projects" DROP CONSTRAINT "projects_user_id_fkey";
DROP INDEX "projects_user_id_idx";
ALTER TABLE "projects" DROP COLUMN "user_id";

-- ============================================================
-- COMMENTS: canais, autor e thread
-- ============================================================
ALTER TABLE "comments" ADD COLUMN "channel" "CommentChannel" NOT NULL DEFAULT 'cliente';
ALTER TABLE "comments" ADD COLUMN "autor_type" "CommentAuthorType" NOT NULL DEFAULT 'cliente';
ALTER TABLE "comments" ADD COLUMN "autor_user_id" TEXT;
ALTER TABLE "comments" ADD COLUMN "parent_comment_id" TEXT;
-- autor_nome passa a ser opcional (nulo quando autor autenticado)
ALTER TABLE "comments" ALTER COLUMN "autor_nome" DROP NOT NULL;

-- ============================================================
-- INDICES E FOREIGN KEYS
-- ============================================================
-- CreateIndex
CREATE UNIQUE INDEX "invites_token_key" ON "invites"("token");
CREATE INDEX "invites_account_id_idx" ON "invites"("account_id");
CREATE INDEX "users_account_id_idx" ON "users"("account_id");
CREATE INDEX "clients_account_id_idx" ON "clients"("account_id");
CREATE INDEX "projects_account_id_idx" ON "projects"("account_id");
CREATE INDEX "comments_parent_comment_id_idx" ON "comments"("parent_comment_id");
CREATE INDEX "comments_autor_user_id_idx" ON "comments"("autor_user_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invites" ADD CONSTRAINT "invites_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "clients" ADD CONSTRAINT "clients_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "projects" ADD CONSTRAINT "projects_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "comments" ADD CONSTRAINT "comments_autor_user_id_fkey" FOREIGN KEY ("autor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_comment_id_fkey" FOREIGN KEY ("parent_comment_id") REFERENCES "comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

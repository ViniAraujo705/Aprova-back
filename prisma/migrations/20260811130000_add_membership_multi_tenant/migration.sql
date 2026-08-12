-- Migration: multi-tenancy - um User pode pertencer a varias Accounts.
-- Cria Membership (vinculo User<->Account com role/status proprios),
-- faz backfill de um Membership por User existente (preservando
-- account_id/role/status atuais) e remove users.account_id - o vinculo
-- com agencia passa a viver exclusivamente em Membership. users.role/status
-- continuam existindo mas mudam de significado: role so importa para
-- 'admin' (staff da plataforma) e status vira banimento global, ver
-- comentarios em schema.prisma (model User).

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ativo',
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- ============================================================
-- MIGRACAO DE DADOS: um Membership por User existente
-- ============================================================

INSERT INTO "memberships" ("id", "user_id", "account_id", "role", "status", "criado_em", "atualizado_em")
SELECT gen_random_uuid()::text, "id", "account_id", "role", "status", "criado_em", CURRENT_TIMESTAMP
FROM "users";

-- ============================================================
-- REMOVE O VINCULO DIRETO users.account_id (agora via memberships)
-- ============================================================

ALTER TABLE "users" DROP CONSTRAINT "users_account_id_fkey";
DROP INDEX "users_account_id_idx";
ALTER TABLE "users" DROP COLUMN "account_id";

-- ============================================================
-- INDICES E FOREIGN KEYS
-- ============================================================

CREATE UNIQUE INDEX "memberships_user_id_account_id_key" ON "memberships"("user_id", "account_id");
CREATE INDEX "memberships_account_id_idx" ON "memberships"("account_id");
CREATE INDEX "memberships_user_id_idx" ON "memberships"("user_id");

ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

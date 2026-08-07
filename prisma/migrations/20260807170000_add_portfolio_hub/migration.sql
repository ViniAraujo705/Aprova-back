-- Hub publico da agencia: perfil (foto + linkHub) e categorias livres para
-- organizar os albuns de portfolio. capa_url vira campo explicito do album
-- (antes era so derivado do primeiro item na API) - continua com fallback
-- pro posterUrl do primeiro item quando nulo (ver PortfoliosService).

ALTER TABLE "portfolios" ADD COLUMN "capa_url" TEXT;
ALTER TABLE "portfolios" ADD COLUMN "categoria_id" TEXT;

CREATE TABLE "portfolio_categories" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portfolio_categories_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "portfolio_categories_account_id_idx" ON "portfolio_categories"("account_id");

ALTER TABLE "portfolio_categories" ADD CONSTRAINT "portfolio_categories_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "portfolio_profiles" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "foto_url" TEXT,
    "link_hub" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portfolio_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "portfolio_profiles_account_id_key" ON "portfolio_profiles"("account_id");
CREATE UNIQUE INDEX "portfolio_profiles_link_hub_key" ON "portfolio_profiles"("link_hub");

ALTER TABLE "portfolio_profiles" ADD CONSTRAINT "portfolio_profiles_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "portfolios_categoria_id_idx" ON "portfolios"("categoria_id");

ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "portfolio_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

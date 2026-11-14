-- Quadros extras do Kanban, com colunas livres.
CREATE TABLE "quadros" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "posicao" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quadros_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quadro_colunas" (
    "id" TEXT NOT NULL,
    "quadro_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "posicao" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quadro_colunas_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "quadros_account_id_idx" ON "quadros"("account_id");
CREATE INDEX "quadro_colunas_quadro_id_idx" ON "quadro_colunas"("quadro_id");

ALTER TABLE "quadros" ADD CONSTRAINT "quadros_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quadro_colunas" ADD CONSTRAINT "quadro_colunas_quadro_id_fkey" FOREIGN KEY ("quadro_id") REFERENCES "quadros"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Card de quadro extra (null = quadro de producao).
ALTER TABLE "demandas" ADD COLUMN "quadro_id" TEXT;
ALTER TABLE "demandas" ADD COLUMN "coluna_id" TEXT;
CREATE INDEX "demandas_quadro_id_idx" ON "demandas"("quadro_id");
ALTER TABLE "demandas" ADD CONSTRAINT "demandas_quadro_id_fkey" FOREIGN KEY ("quadro_id") REFERENCES "quadros"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "demandas" ADD CONSTRAINT "demandas_coluna_id_fkey" FOREIGN KEY ("coluna_id") REFERENCES "quadro_colunas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

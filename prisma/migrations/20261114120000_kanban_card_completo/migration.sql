-- Card do Kanban estilo Trello: descricao, ordem manual, arquivar e prazo cumprido.
ALTER TABLE "demandas" ADD COLUMN "descricao" TEXT;
ALTER TABLE "demandas" ADD COLUMN "posicao" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "demandas" ADD COLUMN "arquivada_em" TIMESTAMP(3);
ALTER TABLE "demandas" ADD COLUMN "prazo_concluido" BOOLEAN NOT NULL DEFAULT false;

-- Ordem inicial: a mesma que o quadro mostrava (mais recente primeiro dentro da etapa).
UPDATE "demandas" d SET "posicao" = o.rn * 1024
FROM (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "account_id", "etapa" ORDER BY "criado_em" DESC) AS rn
  FROM "demandas"
) o
WHERE d."id" = o."id";

-- Checklist do card.
CREATE TABLE "demanda_checklist_itens" (
    "id" TEXT NOT NULL,
    "demanda_id" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "concluido" BOOLEAN NOT NULL DEFAULT false,
    "posicao" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "demanda_checklist_itens_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "demanda_checklist_itens_demanda_id_idx" ON "demanda_checklist_itens"("demanda_id");

ALTER TABLE "demanda_checklist_itens" ADD CONSTRAINT "demanda_checklist_itens_demanda_id_fkey" FOREIGN KEY ("demanda_id") REFERENCES "demandas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

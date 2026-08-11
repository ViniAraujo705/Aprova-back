-- Etapa de producao interna do board Kanban (agencia), separada do
-- VideoStatus (decisao do cliente). Ver EtapaProducao no schema.

CREATE TYPE "EtapaProducao" AS ENUM ('planejado', 'producao', 'edicao', 'aguardando_aprovacao', 'ajustes', 'aprovado', 'entregue');

ALTER TABLE "videos" ADD COLUMN "etapa_producao" "EtapaProducao" NOT NULL DEFAULT 'planejado';

-- Backfill dos videos existentes com um valor coerente com o status atual
-- (default 'planejado' cobre o caso 'erro', sem mapeamento obvio).
UPDATE "videos" SET "etapa_producao" = 'aguardando_aprovacao' WHERE "status" = 'pendente';
UPDATE "videos" SET "etapa_producao" = 'ajustes' WHERE "status" = 'ajuste';
UPDATE "videos" SET "etapa_producao" = 'aprovado' WHERE "status" = 'aprovado';

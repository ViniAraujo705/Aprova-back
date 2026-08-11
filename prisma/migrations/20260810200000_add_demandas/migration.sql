-- Card generico do board Kanban (planejamento/campanha/gravacao), sem
-- estar ligado a nenhum Video. Escopo direto por conta, mesmo padrao de
-- recording_events/crew_members. Reaproveita o enum "EtapaProducao" ja
-- criado pra Video.etapa_producao.

CREATE TYPE "DemandaTipo" AS ENUM ('projeto', 'campanha', 'gravacao', 'demanda');

CREATE TABLE "demandas" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "tipo" "DemandaTipo" NOT NULL,
    "cliente_id" TEXT,
    "responsavel_id" TEXT,
    "prazo" TIMESTAMP(3),
    "etapa" "EtapaProducao" NOT NULL DEFAULT 'planejado',
    "video_id" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "demandas_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "demandas_account_id_idx" ON "demandas"("account_id");
CREATE INDEX "demandas_cliente_id_idx" ON "demandas"("cliente_id");
CREATE INDEX "demandas_responsavel_id_idx" ON "demandas"("responsavel_id");
CREATE INDEX "demandas_video_id_idx" ON "demandas"("video_id");

ALTER TABLE "demandas" ADD CONSTRAINT "demandas_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "demandas" ADD CONSTRAINT "demandas_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "demandas" ADD CONSTRAINT "demandas_responsavel_id_fkey" FOREIGN KEY ("responsavel_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "demandas" ADD CONSTRAINT "demandas_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Mencao e comentario em card do Kanban viram notificacao.
ALTER TYPE "NotificationType" ADD VALUE 'mencao_demanda';
ALTER TYPE "NotificationType" ADD VALUE 'comentario_demanda';

-- Comentarios da equipe nos cards.
CREATE TABLE "demanda_comentarios" (
    "id" TEXT NOT NULL,
    "demanda_id" TEXT NOT NULL,
    "autor_id" TEXT,
    "texto" TEXT NOT NULL,
    "mencionados" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editado_em" TIMESTAMP(3),

    CONSTRAINT "demanda_comentarios_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "demanda_comentarios_demanda_id_criado_em_idx" ON "demanda_comentarios"("demanda_id", "criado_em");

ALTER TABLE "demanda_comentarios" ADD CONSTRAINT "demanda_comentarios_demanda_id_fkey" FOREIGN KEY ("demanda_id") REFERENCES "demandas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "demanda_comentarios" ADD CONSTRAINT "demanda_comentarios_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Historico de atividade dos cards.
CREATE TABLE "demanda_atividades" (
    "id" TEXT NOT NULL,
    "demanda_id" TEXT NOT NULL,
    "autor_id" TEXT,
    "tipo" TEXT NOT NULL,
    "dados" JSONB,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "demanda_atividades_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "demanda_atividades_demanda_id_criado_em_idx" ON "demanda_atividades"("demanda_id", "criado_em");

ALTER TABLE "demanda_atividades" ADD CONSTRAINT "demanda_atividades_demanda_id_fkey" FOREIGN KEY ("demanda_id") REFERENCES "demandas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "demanda_atividades" ADD CONSTRAINT "demanda_atividades_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

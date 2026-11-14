-- Capa do card (id de um anexo de imagem).
ALTER TABLE "demandas" ADD COLUMN "capa_anexo_id" TEXT;

-- Anexos dos cards do Kanban.
CREATE TABLE "demanda_anexos" (
    "id" TEXT NOT NULL,
    "demanda_id" TEXT NOT NULL,
    "nome_arquivo" TEXT NOT NULL,
    "url_storage" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "tamanho_bytes" INTEGER,
    "enviado_por_id" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "demanda_anexos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "demanda_anexos_demanda_id_idx" ON "demanda_anexos"("demanda_id");

ALTER TABLE "demanda_anexos" ADD CONSTRAINT "demanda_anexos_demanda_id_fkey" FOREIGN KEY ("demanda_id") REFERENCES "demandas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "demanda_anexos" ADD CONSTRAINT "demanda_anexos_enviado_por_id_fkey" FOREIGN KEY ("enviado_por_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

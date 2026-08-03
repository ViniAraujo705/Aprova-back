-- Calendario de gravacoes da agencia: evento com titulo, janela de tempo e
-- vinculos opcionais a um cliente e/ou membro (owner/editor) responsavel.

CREATE TABLE "recording_events" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "data_inicio" TIMESTAMP(3) NOT NULL,
    "data_fim" TIMESTAMP(3),
    "cliente_id" TEXT,
    "membro_id" TEXT,
    "observacoes" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recording_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "recording_events_account_id_idx" ON "recording_events"("account_id");
CREATE INDEX "recording_events_cliente_id_idx" ON "recording_events"("cliente_id");
CREATE INDEX "recording_events_membro_id_idx" ON "recording_events"("membro_id");

ALTER TABLE "recording_events" ADD CONSTRAINT "recording_events_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recording_events" ADD CONSTRAINT "recording_events_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "recording_events" ADD CONSTRAINT "recording_events_membro_id_fkey" FOREIGN KEY ("membro_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

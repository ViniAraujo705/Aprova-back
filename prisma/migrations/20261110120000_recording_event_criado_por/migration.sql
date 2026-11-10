-- Quem criou o evento do calendario (recebe no proprio Google Agenda).
ALTER TABLE "recording_events" ADD COLUMN "criado_por_id" TEXT;

ALTER TABLE "recording_events" ADD CONSTRAINT "recording_events_criado_por_id_fkey" FOREIGN KEY ("criado_por_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Agenda operacional: expande o evento de gravacao para tipos genericos e
-- permite a vinculacao opcional com um card de demanda do Kanban.
CREATE TYPE "RecordingEventTipo" AS ENUM (
  'gravacao', 'captacao', 'ensaio', 'reuniao', 'entrega', 'prazo', 'evento', 'demanda_interna'
);

ALTER TABLE "recording_events"
  ADD COLUMN "tipo" "RecordingEventTipo" NOT NULL DEFAULT 'gravacao',
  ADD COLUMN "demanda_id" TEXT;

CREATE INDEX "recording_events_demanda_id_idx" ON "recording_events"("demanda_id");

ALTER TABLE "recording_events"
  ADD CONSTRAINT "recording_events_demanda_id_fkey"
  FOREIGN KEY ("demanda_id") REFERENCES "demandas"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Lembrete de gravacao proxima (RecordingEvent) para o owner da conta.
-- Notification passa a suportar dois "assuntos" mutuamente exclusivos:
-- video_id (fluxos existentes: comentario/aprovacao/ajuste/avaliacao) ou
-- recording_event_id (lembrete_gravacao, novo). video_id vira opcional.

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'lembrete_gravacao';

-- AlterTable
ALTER TABLE "notifications" ALTER COLUMN "video_id" DROP NOT NULL;
ALTER TABLE "notifications" ADD COLUMN "recording_event_id" TEXT;

-- CreateIndex
-- Garante no maximo uma notificacao de lembrete por evento+owner (idempotencia do cron).
CREATE UNIQUE INDEX "notifications_recording_event_id_user_id_type_key" ON "notifications"("recording_event_id", "user_id", "type");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recording_event_id_fkey" FOREIGN KEY ("recording_event_id") REFERENCES "recording_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

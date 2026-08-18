-- Migration: Google Calendar sync (one-way, Aprova -> Google) para o
-- calendario de gravacoes. GoogleCalendarConnection guarda o refresh token
-- (criptografado na aplicacao) do Google Calendar pessoal de cada usuario;
-- RecordingEventGoogleSync mapeia cada RecordingEvent -> evento criado no
-- Google Calendar de cada destinatario.

-- CreateTable
CREATE TABLE "google_calendar_connections" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "google_email" TEXT,
    "refresh_token_enc" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_calendar_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recording_event_google_sync" (
    "id" TEXT NOT NULL,
    "recording_event_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "google_event_id" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recording_event_google_sync_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "google_calendar_connections_user_id_key" ON "google_calendar_connections"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "recording_event_google_sync_recording_event_id_user_id_key" ON "recording_event_google_sync"("recording_event_id", "user_id");

-- CreateIndex
CREATE INDEX "recording_event_google_sync_user_id_idx" ON "recording_event_google_sync"("user_id");

-- AddForeignKey
ALTER TABLE "google_calendar_connections" ADD CONSTRAINT "google_calendar_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recording_event_google_sync" ADD CONSTRAINT "recording_event_google_sync_recording_event_id_fkey" FOREIGN KEY ("recording_event_id") REFERENCES "recording_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recording_event_google_sync" ADD CONSTRAINT "recording_event_google_sync_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

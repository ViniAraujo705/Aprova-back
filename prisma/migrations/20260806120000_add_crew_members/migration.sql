-- Equipe de gravacao: pessoas que participam das gravacoes mas nao sao
-- usuarios do sistema (freelancers, motorista etc). Cadastro simples por
-- nome, escopado pela conta.
CREATE TABLE "crew_members" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crew_members_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "crew_members_account_id_idx" ON "crew_members"("account_id");

ALTER TABLE "crew_members" ADD CONSTRAINT "crew_members_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Escala N:N entre RecordingEvent e CrewMember (quem participa de cada gravacao).
CREATE TABLE "recording_event_crew" (
    "id" TEXT NOT NULL,
    "recording_event_id" TEXT NOT NULL,
    "crew_member_id" TEXT NOT NULL,

    CONSTRAINT "recording_event_crew_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "recording_event_crew_recording_event_id_crew_member_id_key" ON "recording_event_crew"("recording_event_id", "crew_member_id");
CREATE INDEX "recording_event_crew_crew_member_id_idx" ON "recording_event_crew"("crew_member_id");

ALTER TABLE "recording_event_crew" ADD CONSTRAINT "recording_event_crew_recording_event_id_fkey" FOREIGN KEY ("recording_event_id") REFERENCES "recording_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recording_event_crew" ADD CONSTRAINT "recording_event_crew_crew_member_id_fkey" FOREIGN KEY ("crew_member_id") REFERENCES "crew_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

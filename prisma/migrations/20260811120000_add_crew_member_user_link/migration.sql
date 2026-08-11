-- Vincula um CrewMember a uma conta real do sistema (User) quando a pessoa
-- escalada tem login no Aprova, abrindo espaco pra notificar quem foi
-- escalado numa gravacao (ver NotificationsService.sendRecordingReminders).
-- Null continua sendo o caso comum (freelancer, motorista etc., sem conta).

-- AlterTable
ALTER TABLE "crew_members" ADD COLUMN "user_id" TEXT;

-- CreateIndex
CREATE INDEX "crew_members_user_id_idx" ON "crew_members"("user_id");

-- AddForeignKey
ALTER TABLE "crew_members" ADD CONSTRAINT "crew_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

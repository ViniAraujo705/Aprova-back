-- Notificacoes in-app: owner/editor responsavel ficam cientes de acoes do
-- cliente (comentario, aprovacao, ajuste, avaliacao) num video.

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('comentario_cliente', 'aprovacao_cliente', 'ajuste_solicitado', 'avaliacao_cliente');

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "video_id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "lida" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_user_id_lida_idx" ON "notifications"("user_id", "lida");
CREATE INDEX "notifications_account_id_idx" ON "notifications"("account_id");
CREATE INDEX "notifications_video_id_idx" ON "notifications"("video_id");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

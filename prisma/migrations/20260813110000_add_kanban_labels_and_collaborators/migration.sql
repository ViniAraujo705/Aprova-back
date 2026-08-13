-- Labels compartilhadas por Account e metadados informativos dos cards do
-- Kanban. Colaboradores nao alteram o responsavel unico do video/demanda.

-- CreateEnum
CREATE TYPE "LabelColor" AS ENUM ('red', 'orange', 'amber', 'emerald', 'sky', 'violet', 'pink');

-- CreateTable
CREATE TABLE "labels" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "color" "LabelColor" NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "labels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_labels" (
    "video_id" TEXT NOT NULL,
    "label_id" TEXT NOT NULL,

    CONSTRAINT "video_labels_pkey" PRIMARY KEY ("video_id", "label_id")
);

-- CreateTable
CREATE TABLE "demanda_labels" (
    "demanda_id" TEXT NOT NULL,
    "label_id" TEXT NOT NULL,

    CONSTRAINT "demanda_labels_pkey" PRIMARY KEY ("demanda_id", "label_id")
);

-- CreateTable
CREATE TABLE "video_collaborators" (
    "video_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "video_collaborators_pkey" PRIMARY KEY ("video_id", "user_id")
);

-- CreateTable
CREATE TABLE "demanda_collaborators" (
    "demanda_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "demanda_collaborators_pkey" PRIMARY KEY ("demanda_id", "user_id")
);

-- CreateIndex
CREATE INDEX "labels_account_id_idx" ON "labels"("account_id");
CREATE INDEX "video_labels_label_id_idx" ON "video_labels"("label_id");
CREATE INDEX "demanda_labels_label_id_idx" ON "demanda_labels"("label_id");
CREATE INDEX "video_collaborators_user_id_idx" ON "video_collaborators"("user_id");
CREATE INDEX "demanda_collaborators_user_id_idx" ON "demanda_collaborators"("user_id");

-- AddForeignKey
ALTER TABLE "labels" ADD CONSTRAINT "labels_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "video_labels" ADD CONSTRAINT "video_labels_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "video_labels" ADD CONSTRAINT "video_labels_label_id_fkey" FOREIGN KEY ("label_id") REFERENCES "labels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "demanda_labels" ADD CONSTRAINT "demanda_labels_demanda_id_fkey" FOREIGN KEY ("demanda_id") REFERENCES "demandas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "demanda_labels" ADD CONSTRAINT "demanda_labels_label_id_fkey" FOREIGN KEY ("label_id") REFERENCES "labels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "video_collaborators" ADD CONSTRAINT "video_collaborators_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "video_collaborators" ADD CONSTRAINT "video_collaborators_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "demanda_collaborators" ADD CONSTRAINT "demanda_collaborators_demanda_id_fkey" FOREIGN KEY ("demanda_id") REFERENCES "demandas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "demanda_collaborators" ADD CONSTRAINT "demanda_collaborators_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Mantem a experiencia atual para agencias ja existentes. Os ids sao UUIDs
-- deterministas por conta, sem depender de extensoes PostgreSQL adicionais.
INSERT INTO "labels" ("id", "account_id", "text", "color", "atualizado_em")
SELECT
    substring(md5("id" || ':Urgente') from 1 for 8) || '-' || substring(md5("id" || ':Urgente') from 9 for 4) || '-4' || substring(md5("id" || ':Urgente') from 14 for 3) || '-a' || substring(md5("id" || ':Urgente') from 18 for 3) || '-' || substring(md5("id" || ':Urgente') from 21 for 12),
    "id", 'Urgente', 'red', CURRENT_TIMESTAMP
FROM "accounts";

INSERT INTO "labels" ("id", "account_id", "text", "color", "atualizado_em")
SELECT
    substring(md5("id" || ':Revisão') from 1 for 8) || '-' || substring(md5("id" || ':Revisão') from 9 for 4) || '-4' || substring(md5("id" || ':Revisão') from 14 for 3) || '-a' || substring(md5("id" || ':Revisão') from 18 for 3) || '-' || substring(md5("id" || ':Revisão') from 21 for 12),
    "id", 'Revisão', 'amber', CURRENT_TIMESTAMP
FROM "accounts";

INSERT INTO "labels" ("id", "account_id", "text", "color", "atualizado_em")
SELECT
    substring(md5("id" || ':Cliente VIP') from 1 for 8) || '-' || substring(md5("id" || ':Cliente VIP') from 9 for 4) || '-4' || substring(md5("id" || ':Cliente VIP') from 14 for 3) || '-a' || substring(md5("id" || ':Cliente VIP') from 18 for 3) || '-' || substring(md5("id" || ':Cliente VIP') from 21 for 12),
    "id", 'Cliente VIP', 'violet', CURRENT_TIMESTAMP
FROM "accounts";

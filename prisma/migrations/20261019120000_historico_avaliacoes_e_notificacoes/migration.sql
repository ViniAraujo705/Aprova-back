-- Novos tipos de notificacao (prazo, demanda, pendencia do cliente).
ALTER TYPE "NotificationType" ADD VALUE 'prazo_proximo';
ALTER TYPE "NotificationType" ADD VALUE 'prazo_vencido';
ALTER TYPE "NotificationType" ADD VALUE 'nova_demanda';
ALTER TYPE "NotificationType" ADD VALUE 'aguardando_cliente';

-- Preferencias de e-mail das notificacoes.
ALTER TABLE "users" ADD COLUMN     "email_imediato" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "email_resumo_diario" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "email_tipos_desligados" "NotificationType"[] DEFAULT ARRAY[]::"NotificationType"[];

ALTER TABLE "notifications" ADD COLUMN     "chave" TEXT,
ADD COLUMN     "demanda_id" TEXT,
ADD COLUMN     "email_enviado_em" TIMESTAMP(3);

-- Notificacoes que ja existem nao vao para o e-mail: o resumo diario so
-- comeca a valer para o que acontecer depois deste deploy.
UPDATE "notifications" SET "email_enviado_em" = CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "notifications_user_id_chave_key" ON "notifications"("user_id", "chave");

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_demanda_id_fkey" FOREIGN KEY ("demanda_id") REFERENCES "demandas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Historico de avaliacoes: a nota deixa de cair em cascata com o video e
-- guarda conta/projeto/cliente + os nomes, para o relatorio sobreviver a
-- exclusao do video, do projeto ou do cliente.
ALTER TABLE "ratings" DROP CONSTRAINT "ratings_video_id_fkey";

ALTER TABLE "ratings" ADD COLUMN     "account_id" TEXT,
ADD COLUMN     "cliente_id" TEXT,
ADD COLUMN     "cliente_nome" TEXT,
ADD COLUMN     "project_id" TEXT,
ADD COLUMN     "projeto_nome" TEXT,
ADD COLUMN     "video_nome" TEXT,
ALTER COLUMN "video_id" DROP NOT NULL,
ALTER COLUMN "rating_question_id" DROP NOT NULL;

UPDATE "ratings" r
SET "account_id" = p."account_id",
    "project_id" = p."id",
    "projeto_nome" = p."nome",
    "cliente_id" = p."client_id",
    "cliente_nome" = COALESCE(c."nome", p."contato_avulso"),
    "video_nome" = v."nome_arquivo"
FROM "videos" v
JOIN "projects" p ON p."id" = v."project_id"
LEFT JOIN "clients" c ON c."id" = p."client_id"
WHERE v."id" = r."video_id";

-- A nota geral da aprovacao (videos.nota_geral) vira uma linha de rating sem
-- pergunta, para entrar no mesmo historico.
INSERT INTO "ratings" ("id", "account_id", "video_id", "rating_question_id", "project_id", "cliente_id", "video_nome", "projeto_nome", "cliente_nome", "nota", "criado_em")
SELECT gen_random_uuid()::text, p."account_id", v."id", NULL, p."id", p."client_id", v."nome_arquivo", p."nome", COALESCE(c."nome", p."contato_avulso"), v."nota_geral", COALESCE(v."aprovado_em", v."criado_em")
FROM "videos" v
JOIN "projects" p ON p."id" = v."project_id"
LEFT JOIN "clients" c ON c."id" = p."client_id"
WHERE v."nota_geral" IS NOT NULL;

ALTER TABLE "ratings" ALTER COLUMN "account_id" SET NOT NULL;

CREATE INDEX "ratings_account_id_criado_em_idx" ON "ratings"("account_id", "criado_em");

ALTER TABLE "ratings" ADD CONSTRAINT "ratings_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

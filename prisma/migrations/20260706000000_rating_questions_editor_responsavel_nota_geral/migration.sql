-- Migration: perguntas de avaliacao customizaveis (substituem as categorias
-- fixas iluminacao/audio/enquadramento), editor responsavel pelo video e
-- nota geral do cliente na aprovacao.

-- CreateTable: rating_questions
CREATE TABLE "rating_questions" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rating_questions_pkey" PRIMARY KEY ("id")
);

-- ============================================================
-- MIGRACAO DE DADOS: cria as 3 perguntas padrao (equivalentes as antigas
-- categorias fixas) para cada conta ja existente, e reaponta os ratings
-- existentes para a pergunta equivalente da mesma conta. Contas criadas
-- a partir de agora ja nascem com essas 3 perguntas (ver AuthService).
-- Usamos uma tabela temporaria (em vez de CTE) porque o mapeamento
-- conta+categoria precisa ser reaproveitado em dois statements (INSERT e
-- UPDATE) e uma CTE nao sobrevive entre statements.
-- ============================================================
CREATE TEMP TABLE "_rq_map" AS
SELECT gen_random_uuid()::text AS id, a."id" AS account_id, d.texto, d.ordem, d.categoria
FROM "accounts" a
CROSS JOIN (VALUES
  ('Iluminação', 0, 'iluminacao'),
  ('Áudio', 1, 'audio'),
  ('Enquadramento', 2, 'enquadramento')
) AS d(texto, ordem, categoria);

INSERT INTO "rating_questions" ("id", "account_id", "texto", "ordem")
SELECT "id", "account_id", "texto", "ordem" FROM "_rq_map";

-- ratings.rating_question_id: nullable durante o backfill
ALTER TABLE "ratings" ADD COLUMN "rating_question_id" TEXT;

-- Nota: a comparacao com "categoria" (da tabela alvo do UPDATE) precisa
-- ficar no WHERE - Postgres nao permite referenciar a tabela alvo dentro
-- do ON de um JOIN no FROM-list.
UPDATE "ratings" r
SET "rating_question_id" = m."id"
FROM "videos" v
JOIN "projects" p ON p."id" = v."project_id"
JOIN "_rq_map" m ON m."account_id" = p."account_id"
WHERE r."video_id" = v."id"
  AND m."categoria" = r."categoria"::text;

DROP TABLE "_rq_map";

-- Agora rating_question_id e obrigatorio
ALTER TABLE "ratings" ALTER COLUMN "rating_question_id" SET NOT NULL;

-- Remove a coluna e o enum antigos (categorias fixas)
ALTER TABLE "ratings" DROP COLUMN "categoria";
DROP TYPE "RatingCategory";

-- ============================================================
-- VIDEOS: editor responsavel + nota geral na aprovacao
-- ============================================================
ALTER TABLE "videos" ADD COLUMN "editor_responsavel_id" TEXT;
ALTER TABLE "videos" ADD COLUMN "nota_geral" INTEGER;

-- CreateIndex
CREATE INDEX "rating_questions_account_id_idx" ON "rating_questions"("account_id");
CREATE INDEX "ratings_rating_question_id_idx" ON "ratings"("rating_question_id");
CREATE INDEX "videos_editor_responsavel_id_idx" ON "videos"("editor_responsavel_id");

-- AddForeignKey
ALTER TABLE "rating_questions" ADD CONSTRAINT "rating_questions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_rating_question_id_fkey" FOREIGN KEY ("rating_question_id") REFERENCES "rating_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "videos" ADD CONSTRAINT "videos_editor_responsavel_id_fkey" FOREIGN KEY ("editor_responsavel_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

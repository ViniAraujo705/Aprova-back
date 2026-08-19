-- Um video pode ter varias pessoas responsaveis. Preserva a atribuicao unica
-- existente antes de remover a coluna legada.

CREATE TABLE "video_responsaveis" (
    "video_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "video_responsaveis_pkey" PRIMARY KEY ("video_id", "user_id")
);

CREATE INDEX "video_responsaveis_user_id_idx" ON "video_responsaveis"("user_id");

ALTER TABLE "video_responsaveis" ADD CONSTRAINT "video_responsaveis_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "video_responsaveis" ADD CONSTRAINT "video_responsaveis_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "video_responsaveis" ("video_id", "user_id")
SELECT "id", "editor_responsavel_id"
FROM "videos"
WHERE "editor_responsavel_id" IS NOT NULL;

DROP INDEX IF EXISTS "videos_editor_responsavel_id_idx";
ALTER TABLE "videos" DROP COLUMN "editor_responsavel_id";

-- Link unico da galeria publica do projeto (ver PublicService.getProject).
-- Backfill nas linhas existentes antes de tornar a coluna obrigatoria,
-- seguindo o mesmo padrao da migracao de rating_questions.

ALTER TABLE "projects" ADD COLUMN "link_publico" TEXT;

UPDATE "projects" SET "link_publico" = gen_random_uuid()::text WHERE "link_publico" IS NULL;

ALTER TABLE "projects" ALTER COLUMN "link_publico" SET NOT NULL;

CREATE UNIQUE INDEX "projects_link_publico_key" ON "projects"("link_publico");

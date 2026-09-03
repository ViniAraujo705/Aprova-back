-- Miniatura interna do projeto (card da lista, cabecalho do projeto e lista
-- de projetos dentro do cliente). Nullable: projeto sem foto e o normal.
ALTER TABLE "projects" ADD COLUMN "foto_url" TEXT;

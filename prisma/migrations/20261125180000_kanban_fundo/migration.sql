-- Fundo do quadro do Kanban (so ADD COLUMN, sem perda de dados).
ALTER TABLE "quadros" ADD COLUMN "fundo" VARCHAR(20);
ALTER TABLE "accounts" ADD COLUMN "kanban_fundo" VARCHAR(20);

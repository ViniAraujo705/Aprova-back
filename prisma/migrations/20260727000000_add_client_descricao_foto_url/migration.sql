-- Adiciona descricao (legenda) e foto_url ao cliente, usados no modo
-- "Preview Reels" da galeria publica.
ALTER TABLE "clients" ADD COLUMN "descricao" TEXT;
ALTER TABLE "clients" ADD COLUMN "foto_url" TEXT;

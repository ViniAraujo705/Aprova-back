-- Comentario por audio do cliente (alternativa ao texto): texto passa a
-- ser opcional e ganha audio_url para guardar a URL publica do arquivo no R2.

ALTER TABLE "comments" ALTER COLUMN "texto" DROP NOT NULL;
ALTER TABLE "comments" ADD COLUMN "audio_url" TEXT;

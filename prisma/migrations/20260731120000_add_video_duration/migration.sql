-- Duracao do video (segundos), extraida via ffprobe no pipeline de
-- processamento em background. Null ate o processamento terminar.
ALTER TABLE "videos" ADD COLUMN "duracao_segundos" INTEGER;

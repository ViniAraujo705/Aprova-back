-- Projeto avulso: cliente opcional + nome livre de quem recebe o link
ALTER TABLE "projects" ALTER COLUMN "client_id" DROP NOT NULL;
ALTER TABLE "projects" ADD COLUMN "contato_avulso" TEXT;

-- Liberar armazenamento de projeto aprovado: marca o video cujo arquivo saiu do R2
ALTER TABLE "videos" ADD COLUMN "arquivo_removido_em" TIMESTAMP(3);

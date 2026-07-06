-- CreateEnum
CREATE TYPE "ProcessamentoStatus" AS ENUM ('processando', 'pronto', 'erro');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "logo_url" TEXT,
ADD COLUMN     "cor_destaque" TEXT;

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "is_exemplo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "is_exemplo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "videos" ADD COLUMN     "thumbnail_url" TEXT,
ADD COLUMN     "url_otimizada" TEXT,
ADD COLUMN     "status_processamento" "ProcessamentoStatus" NOT NULL DEFAULT 'processando',
ADD COLUMN     "aprovado_em" TIMESTAMP(3),
ADD COLUMN     "is_exemplo" BOOLEAN NOT NULL DEFAULT false;

-- Migration: central do cliente - trilha de auditoria (ClientActivity,
-- append-only, gravada automaticamente pelo backend) e arquivos
-- operacionais do cliente (ClientFile: briefing/contrato/referencia/
-- roteiro/outro, nunca exposto nos links publicos).

-- CreateEnum
CREATE TYPE "ClientActivityType" AS ENUM ('video_enviado', 'aprovacao_cliente', 'ajuste_solicitado', 'comentario_cliente', 'resposta_agencia', 'nova_versao', 'arquivo_enviado', 'arquivo_removido', 'nota_atualizada');

-- CreateEnum
CREATE TYPE "ClientActivityAtorTipo" AS ENUM ('cliente', 'owner', 'editor', 'sistema');

-- CreateEnum
CREATE TYPE "ClientFileCategoria" AS ENUM ('briefing', 'contrato', 'referencia', 'roteiro', 'outro');

-- CreateTable
CREATE TABLE "client_files" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "nome_arquivo" TEXT NOT NULL,
    "url_storage" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "tamanho_bytes" INTEGER,
    "categoria" "ClientFileCategoria" NOT NULL DEFAULT 'outro',
    "descricao" TEXT,
    "enviado_por_id" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_activities" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "tipo" "ClientActivityType" NOT NULL,
    "ator_tipo" "ClientActivityAtorTipo" NOT NULL,
    "ator_nome" TEXT,
    "video_id" TEXT,
    "project_id" TEXT,
    "arquivo_id" TEXT,
    "descricao" TEXT,
    "metadados" JSONB,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_files_cliente_id_idx" ON "client_files"("cliente_id");

-- CreateIndex
CREATE INDEX "client_files_account_id_idx" ON "client_files"("account_id");

-- CreateIndex
CREATE INDEX "client_activities_cliente_id_criado_em_idx" ON "client_activities"("cliente_id", "criado_em");

-- CreateIndex
CREATE INDEX "client_activities_account_id_idx" ON "client_activities"("account_id");

-- AddForeignKey
ALTER TABLE "client_files" ADD CONSTRAINT "client_files_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_files" ADD CONSTRAINT "client_files_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_files" ADD CONSTRAINT "client_files_enviado_por_id_fkey" FOREIGN KEY ("enviado_por_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_activities" ADD CONSTRAINT "client_activities_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_activities" ADD CONSTRAINT "client_activities_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_activities" ADD CONSTRAINT "client_activities_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_activities" ADD CONSTRAINT "client_activities_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_activities" ADD CONSTRAINT "client_activities_arquivo_id_fkey" FOREIGN KEY ("arquivo_id") REFERENCES "client_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

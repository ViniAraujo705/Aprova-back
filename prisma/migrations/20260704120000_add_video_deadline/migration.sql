-- AlterTable: prazo de entrega (owner -> editor), nunca exposto ao cliente
ALTER TABLE "videos" ADD COLUMN "deadline" TIMESTAMP(3);

-- Email do cliente agora e opcional (front nao exige mais no cadastro).
ALTER TABLE "clients" ALTER COLUMN "email" DROP NOT NULL;

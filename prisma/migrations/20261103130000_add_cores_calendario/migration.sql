-- Cores personalizadas dos tipos de evento do calendario, por conta.
-- JSON { "gravacao": "#hex", ... }; null = todas no padrao do sistema.
ALTER TABLE "accounts" ADD COLUMN "cores_calendario" JSONB;

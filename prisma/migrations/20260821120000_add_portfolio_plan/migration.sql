-- Novo plano comercial "portfolio" (R$19/mes ou R$192/ano): so portfolio
-- publico, sem clientes/equipe/aprovacao. Ver src/plans/plan-limits.config.ts.

-- AlterEnum
ALTER TYPE "Plan" ADD VALUE 'portfolio';

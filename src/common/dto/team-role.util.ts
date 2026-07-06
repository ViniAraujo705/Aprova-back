import { UserRole } from '@prisma/client';

/**
 * Renomeia o campo `role` do Prisma para `teamRole` na resposta da API —
 * o front so reconhece esse nome (nao mexe no model/coluna do banco).
 */
export function toMemberDto<T extends { role: UserRole }>(member: T) {
  const { role, ...rest } = member;
  return { ...rest, teamRole: role };
}

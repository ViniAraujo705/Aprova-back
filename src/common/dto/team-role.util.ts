import { UserRole } from '@prisma/client';

/**
 * Renomeia o campo `role` do Prisma para `teamRole`, e `avatarUrl` para
 * `fotoUrl`, na resposta da API — o front so reconhece esses nomes (nao
 * mexe no model/coluna do banco). `avatarUrl` so aparece no objeto quando
 * o caller selecionou essa coluna no Prisma; do contrario `fotoUrl` fica
 * de fora da resposta (undefined nao e serializado no JSON).
 */
export function toMemberDto<
  T extends { role: UserRole; avatarUrl?: string | null },
>(member: T) {
  const { role, avatarUrl, ...rest } = member;
  return {
    ...rest,
    teamRole: role,
    ...(avatarUrl !== undefined ? { fotoUrl: avatarUrl } : {}),
  };
}

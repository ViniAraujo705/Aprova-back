import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Marca (white label) da agencia: logo/cor moram no User do OWNER (ver
 * User.logoUrl/corDestaque - PATCH /users/me/branding so aceita `owner`),
 * nao no Account. Por isso resolve sempre pelo membership de role owner da
 * conta, nunca pelo usuario que esta autenticando/aceitando convite (que
 * pode ser um editor, cujas proprias colunas de branding nunca sao
 * preenchidas). Mesmo padrao ja usado nas paginas publicas (public.service.ts).
 * Conta com 2+ owners (ver AccountService.promoteMemberToOwner): usa o mais
 * antigo, por determinismo.
 */
export async function resolveOwnerBranding(
  prisma: PrismaService,
  accountId: string,
): Promise<{ logoUrl: string | null; corDestaque: string | null }> {
  const ownerMembership = await prisma.membership.findFirst({
    where: { accountId, role: UserRole.owner },
    orderBy: { criadoEm: 'asc' },
    select: { user: { select: { logoUrl: true, corDestaque: true } } },
  });

  return {
    logoUrl: ownerMembership?.user.logoUrl ?? null,
    corDestaque: ownerMembership?.user.corDestaque ?? null,
  };
}

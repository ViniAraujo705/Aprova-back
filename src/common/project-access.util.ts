import { NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/decorators/current-user.decorator';

/**
 * Owner sempre tem acesso a qualquer projeto da propria conta. Editor so
 * acessa projetos onde existe uma linha em ProjectMember — usado em toda
 * leitura/mutacao de projeto, video ou comentario interno para fechar o
 * escopo (nao apenas nas listagens). 404 (nao 403) para nao revelar a um
 * editor nao atribuido que o projeto existe.
 */
export async function assertProjectAccess(
  prisma: PrismaService,
  projectId: string,
  user: Pick<AuthUser, 'id' | 'role'>,
): Promise<void> {
  if (user.role !== UserRole.editor) {
    return;
  }
  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: user.id } },
    select: { id: true },
  });
  if (!membership) {
    throw new NotFoundException('Projeto nao encontrado');
  }
}

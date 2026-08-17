import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { createWithUniqueLinkPublico } from '../common/short-id.util';
import { assertProjectAccess } from '../common/project-access.util';
import { AuthUser } from '../auth/decorators/current-user.decorator';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

const MEMBER_SELECT = {
  id: true,
  userId: true,
  user: { select: { id: true, nome: true, email: true } },
} as const;

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(accountId: string, dto: CreateProjectDto, user: AuthUser) {
    await this.assertClientOwnership(accountId, dto.clientId);
    return createWithUniqueLinkPublico((linkPublico) =>
      this.prisma.project.create({
        data: {
          nome: dto.nome,
          clientId: dto.clientId,
          accountId,
          linkPublico,
          // Um editor só acessa projetos nos quais consta em ProjectMember.
          // Ao criar o projeto, ele precisa receber esse vínculo para poder
          // vê-lo e enviar o primeiro vídeo imediatamente em seguida.
          ...(user.role === UserRole.editor
            ? { members: { create: { userId: user.id } } }
            : {}),
        },
      }),
    );
  }

  /**
   * Owner ve todos os projetos da conta. Editor so ve projetos onde foi
   * atribuido via ProjectMember (ver assertProjectAccess).
   */
  findAll(accountId: string, user: AuthUser) {
    return this.prisma.project.findMany({
      where: {
        accountId,
        ...(user.role === UserRole.editor
          ? { members: { some: { userId: user.id } } }
          : {}),
      },
      orderBy: { criadoEm: 'desc' },
      include: { client: { select: { id: true, nome: true } } },
    });
  }

  async findOne(accountId: string, id: string, user: AuthUser) {
    const project = await this.prisma.project.findFirst({
      where: { id, accountId },
      include: {
        client: { select: { id: true, nome: true } },
        members: { select: MEMBER_SELECT },
      },
    });
    if (!project) {
      throw new NotFoundException('Projeto nao encontrado');
    }
    await assertProjectAccess(this.prisma, id, user);
    return project;
  }

  async update(
    accountId: string,
    id: string,
    dto: UpdateProjectDto,
    user: AuthUser,
  ) {
    await this.findOne(accountId, id, user);
    if (dto.clientId) {
      await this.assertClientOwnership(accountId, dto.clientId);
    }
    return this.prisma.project.update({
      where: { id },
      data: dto,
    });
  }

  async remove(accountId: string, id: string, user: AuthUser) {
    await this.findOne(accountId, id, user);
    await this.prisma.project.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * Atribui um editor (ou owner) ao projeto. Idempotente: atribuir de novo
   * quem ja e membro nao gera erro nem duplicata (constraint unique).
   */
  async addMember(accountId: string, projectId: string, memberId: string) {
    await this.assertProjectInAccount(accountId, projectId);
    const membro = await this.prisma.membership.findFirst({
      where: {
        userId: memberId,
        accountId,
        role: { in: [UserRole.owner, UserRole.editor] },
      },
      select: { userId: true },
    });
    if (!membro) {
      throw new BadRequestException(
        'Membro invalido ou nao pertence a esta conta',
      );
    }

    await this.prisma.projectMember.upsert({
      where: { projectId_userId: { projectId, userId: memberId } },
      create: { projectId, userId: memberId },
      update: {},
    });
    return this.prisma.projectMember.findMany({
      where: { projectId },
      select: MEMBER_SELECT,
    });
  }

  async removeMember(accountId: string, projectId: string, memberId: string) {
    await this.assertProjectInAccount(accountId, projectId);
    await this.prisma.projectMember.deleteMany({
      where: { projectId, userId: memberId },
    });
    return this.prisma.projectMember.findMany({
      where: { projectId },
      select: MEMBER_SELECT,
    });
  }

  private async assertProjectInAccount(accountId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, accountId },
      select: { id: true },
    });
    if (!project) {
      throw new NotFoundException('Projeto nao encontrado');
    }
  }

  private async assertClientOwnership(accountId: string, clientId: string) {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, accountId },
    });
    if (!client) {
      throw new BadRequestException(
        'Cliente nao encontrado ou nao pertence a esta conta',
      );
    }
  }
}

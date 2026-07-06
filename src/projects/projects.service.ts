import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(accountId: string, dto: CreateProjectDto) {
    await this.assertClientOwnership(accountId, dto.clientId);
    return this.prisma.project.create({
      data: {
        nome: dto.nome,
        clientId: dto.clientId,
        accountId,
      },
    });
  }

  findAll(accountId: string) {
    return this.prisma.project.findMany({
      where: { accountId },
      orderBy: { criadoEm: 'desc' },
      include: { client: { select: { id: true, nome: true } } },
    });
  }

  async findOne(accountId: string, id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, accountId },
      include: { client: { select: { id: true, nome: true } } },
    });
    if (!project) {
      throw new NotFoundException('Projeto nao encontrado');
    }
    return project;
  }

  async update(accountId: string, id: string, dto: UpdateProjectDto) {
    await this.findOne(accountId, id);
    if (dto.clientId) {
      await this.assertClientOwnership(accountId, dto.clientId);
    }
    return this.prisma.project.update({
      where: { id },
      data: dto,
    });
  }

  async remove(accountId: string, id: string) {
    await this.findOne(accountId, id);
    await this.prisma.project.delete({ where: { id } });
    return { deleted: true };
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

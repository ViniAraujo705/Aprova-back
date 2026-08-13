import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EtapaProducao, UserRole, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDemandaDto } from './dto/create-demanda.dto';
import { UpdateDemandaDto } from './dto/update-demanda.dto';

const DEMANDA_SELECT = {
  id: true,
  titulo: true,
  tipo: true,
  clienteId: true,
  responsavelId: true,
  prazo: true,
  etapa: true,
  videoId: true,
  criadoEm: true,
  atualizadoEm: true,
  cliente: { select: { nome: true } },
  responsavel: { select: { nome: true } },
  labels: { select: { labelId: true } },
  collaborators: { select: { userId: true } },
} as const;

type RawDemanda = {
  cliente: { nome: string } | null;
  responsavel: { nome: string } | null;
  labels: { labelId: string }[];
  collaborators: { userId: string }[];
} & Record<string, unknown>;

function toDto(demanda: RawDemanda) {
  const { cliente, responsavel, labels, collaborators, ...rest } = demanda;
  return {
    ...rest,
    clienteNome: cliente?.nome ?? null,
    responsavelNome: responsavel?.nome ?? null,
    labelIds: labels.map((label) => label.labelId),
    collaboratorIds: collaborators.map((collaborator) => collaborator.userId),
  };
}

@Injectable()
export class DemandasService {
  constructor(private readonly prisma: PrismaService) {}

  async create(accountId: string, dto: CreateDemandaDto) {
    await this.assertRefsBelongToAccount(accountId, dto);
    await this.assertKanbanRefsBelongToAccount(
      accountId,
      dto.labelIds,
      dto.collaboratorIds,
    );

    const demanda = await this.prisma.demanda.create({
      data: {
        accountId,
        titulo: dto.titulo,
        tipo: dto.tipo,
        clienteId: dto.clienteId ?? null,
        responsavelId: dto.responsavelId ?? null,
        prazo: dto.prazo ? new Date(dto.prazo) : null,
        etapa: dto.etapa ?? EtapaProducao.planejado,
        ...(dto.labelIds
          ? { labels: { create: dto.labelIds.map((labelId) => ({ labelId })) } }
          : {}),
        ...(dto.collaboratorIds
          ? {
              collaborators: {
                create: dto.collaboratorIds.map((userId) => ({ userId })),
              },
            }
          : {}),
      },
      select: DEMANDA_SELECT,
    });
    return toDto(demanda);
  }

  async findAll(accountId: string) {
    const demandas = await this.prisma.demanda.findMany({
      where: { accountId },
      orderBy: { criadoEm: 'desc' },
      select: DEMANDA_SELECT,
    });
    return demandas.map(toDto);
  }

  async update(accountId: string, id: string, dto: UpdateDemandaDto) {
    await this.getOwned(accountId, id);
    await this.assertRefsBelongToAccount(accountId, dto);
    await this.assertKanbanRefsBelongToAccount(
      accountId,
      dto.labelIds,
      dto.collaboratorIds,
    );

    const demanda = await this.prisma.demanda.update({
      where: { id },
      data: {
        ...(dto.titulo !== undefined ? { titulo: dto.titulo } : {}),
        ...(dto.tipo !== undefined ? { tipo: dto.tipo } : {}),
        ...(dto.clienteId !== undefined ? { clienteId: dto.clienteId } : {}),
        ...(dto.responsavelId !== undefined
          ? { responsavelId: dto.responsavelId }
          : {}),
        ...(dto.prazo !== undefined
          ? { prazo: dto.prazo ? new Date(dto.prazo) : null }
          : {}),
        ...(dto.labelIds !== undefined
          ? {
              labels: {
                deleteMany: {},
                create: dto.labelIds.map((labelId) => ({ labelId })),
              },
            }
          : {}),
        ...(dto.collaboratorIds !== undefined
          ? {
              collaborators: {
                deleteMany: {},
                create: dto.collaboratorIds.map((userId) => ({ userId })),
              },
            }
          : {}),
      },
      select: DEMANDA_SELECT,
    });
    return toDto(demanda);
  }

  async updateEtapa(accountId: string, id: string, etapa: EtapaProducao) {
    await this.getOwned(accountId, id);
    const demanda = await this.prisma.demanda.update({
      where: { id },
      data: { etapa },
      select: DEMANDA_SELECT,
    });
    return toDto(demanda);
  }

  async remove(accountId: string, id: string) {
    await this.getOwned(accountId, id);
    await this.prisma.demanda.delete({ where: { id } });
    return { deleted: true };
  }

  private async getOwned(accountId: string, id: string) {
    const demanda = await this.prisma.demanda.findFirst({
      where: { id, accountId },
      select: { id: true },
    });
    if (!demanda) {
      throw new NotFoundException('Demanda nao encontrada');
    }
    return demanda;
  }

  /**
   * clienteId/responsavelId sao opcionais, mas quando enviados precisam
   * pertencer a mesma conta do usuario autenticado (evita vazar/associar
   * dados de outra agencia) - mesmo padrao de RecordingEventsService.
   */
  private async assertRefsBelongToAccount(
    accountId: string,
    dto: Pick<CreateDemandaDto, 'clienteId' | 'responsavelId'>,
  ): Promise<void> {
    if (dto.clienteId) {
      const cliente = await this.prisma.client.findFirst({
        where: { id: dto.clienteId, accountId },
        select: { id: true },
      });
      if (!cliente) {
        throw new BadRequestException('clienteId invalido');
      }
    }
    if (dto.responsavelId) {
      const responsavel = await this.prisma.membership.findFirst({
        where: { userId: dto.responsavelId, accountId },
        select: { userId: true },
      });
      if (!responsavel) {
        throw new BadRequestException('responsavelId invalido');
      }
    }
  }

  private async assertKanbanRefsBelongToAccount(
    accountId: string,
    labelIds?: string[],
    collaboratorIds?: string[],
  ): Promise<void> {
    const checks: Promise<void>[] = [];
    if (labelIds && labelIds.length > 0) {
      checks.push(
        this.prisma.label
          .count({ where: { accountId, id: { in: labelIds } } })
          .then((count) => {
            if (count !== labelIds.length) {
              throw new BadRequestException(
                'labelIds contem label invalida ou de outra conta',
              );
            }
          }),
      );
    }
    if (collaboratorIds && collaboratorIds.length > 0) {
      checks.push(
        this.prisma.membership
          .count({
            where: {
              accountId,
              userId: { in: collaboratorIds },
              role: { in: [UserRole.owner, UserRole.editor] },
              status: UserStatus.ativo,
            },
          })
          .then((count) => {
            if (count !== collaboratorIds.length) {
              throw new BadRequestException(
                'collaboratorIds contem membro invalido ou de outra conta',
              );
            }
          }),
      );
    }
    await Promise.all(checks);
  }
}

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRecordingEventDto } from './dto/create-recording-event.dto';
import { UpdateRecordingEventDto } from './dto/update-recording-event.dto';

const RECORDING_EVENT_SELECT = {
  id: true,
  titulo: true,
  dataInicio: true,
  dataFim: true,
  clienteId: true,
  membroId: true,
  observacoes: true,
  cliente: { select: { nome: true } },
  membro: { select: { nome: true } },
  equipe: { select: { crewMember: { select: { id: true, nome: true } } } },
} as const;

type RawRecordingEvent = {
  id: string;
  titulo: string;
  dataInicio: Date;
  dataFim: Date | null;
  clienteId: string | null;
  membroId: string | null;
  observacoes: string | null;
  cliente: { nome: string } | null;
  membro: { nome: string } | null;
  equipe: { crewMember: { id: string; nome: string } }[];
};

function toDto(event: RawRecordingEvent) {
  const { cliente, membro, equipe, ...rest } = event;
  return {
    ...rest,
    clienteNome: cliente?.nome ?? null,
    membroNome: membro?.nome ?? null,
    equipe: equipe.map((e) => e.crewMember),
  };
}

function dedupe(ids: string[]): string[] {
  return Array.from(new Set(ids));
}

@Injectable()
export class RecordingEventsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(accountId: string, dto: CreateRecordingEventDto) {
    await this.assertRefsBelongToAccount(accountId, dto);
    const equipeIds = dto.equipeIds ? dedupe(dto.equipeIds) : [];

    const event = await this.prisma.recordingEvent.create({
      data: {
        accountId,
        titulo: dto.titulo,
        dataInicio: new Date(dto.dataInicio),
        dataFim: dto.dataFim ? new Date(dto.dataFim) : null,
        clienteId: dto.clienteId ?? null,
        membroId: dto.membroId ?? null,
        observacoes: dto.observacoes ?? null,
        ...(equipeIds.length
          ? {
              equipe: {
                create: equipeIds.map((crewMemberId) => ({ crewMemberId })),
              },
            }
          : {}),
      },
      select: RECORDING_EVENT_SELECT,
    });
    return toDto(event);
  }

  async findAll(accountId: string) {
    const events = await this.prisma.recordingEvent.findMany({
      where: { accountId },
      orderBy: { dataInicio: 'asc' },
      select: RECORDING_EVENT_SELECT,
    });
    return events.map(toDto);
  }

  async findOne(accountId: string, id: string) {
    const event = await this.prisma.recordingEvent.findFirst({
      where: { id, accountId },
      select: RECORDING_EVENT_SELECT,
    });
    if (!event) {
      throw new NotFoundException('Evento de gravacao nao encontrado');
    }
    return toDto(event);
  }

  async update(accountId: string, id: string, dto: UpdateRecordingEventDto) {
    // Garante que o evento pertence a conta antes de atualizar
    await this.findOne(accountId, id);
    await this.assertRefsBelongToAccount(accountId, dto);
    const equipeIds =
      dto.equipeIds !== undefined ? dedupe(dto.equipeIds) : undefined;

    // equipeIds substitui a escala inteira (nao faz merge) — apaga as
    // linhas antigas de RecordingEventCrew antes de recriar, na mesma
    // transacao do update pra nao deixar o evento sem equipe se o segundo
    // passo falhar.
    const event = await this.prisma.$transaction(async (tx) => {
      if (equipeIds !== undefined) {
        await tx.recordingEventCrew.deleteMany({
          where: { recordingEventId: id },
        });
      }
      return tx.recordingEvent.update({
        where: { id },
        data: {
          ...(dto.titulo !== undefined ? { titulo: dto.titulo } : {}),
          ...(dto.dataInicio !== undefined
            ? { dataInicio: new Date(dto.dataInicio) }
            : {}),
          ...(dto.dataFim !== undefined
            ? { dataFim: dto.dataFim ? new Date(dto.dataFim) : null }
            : {}),
          ...(dto.clienteId !== undefined ? { clienteId: dto.clienteId } : {}),
          ...(dto.membroId !== undefined ? { membroId: dto.membroId } : {}),
          ...(dto.observacoes !== undefined
            ? { observacoes: dto.observacoes }
            : {}),
          ...(equipeIds !== undefined && equipeIds.length
            ? {
                equipe: {
                  create: equipeIds.map((crewMemberId) => ({ crewMemberId })),
                },
              }
            : {}),
        },
        select: RECORDING_EVENT_SELECT,
      });
    });
    return toDto(event);
  }

  async remove(accountId: string, id: string) {
    await this.findOne(accountId, id);
    await this.prisma.recordingEvent.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * clienteId/membroId/equipeIds sao opcionais, mas quando enviados
   * precisam pertencer a mesma conta do usuario autenticado (evita
   * vazar/associar dados de outra agencia).
   */
  private async assertRefsBelongToAccount(
    accountId: string,
    dto: Pick<CreateRecordingEventDto, 'clienteId' | 'membroId' | 'equipeIds'>,
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
    if (dto.membroId) {
      const membro = await this.prisma.user.findFirst({
        where: { id: dto.membroId, accountId },
        select: { id: true },
      });
      if (!membro) {
        throw new BadRequestException('membroId invalido');
      }
    }
    if (dto.equipeIds?.length) {
      const equipeIds = dedupe(dto.equipeIds);
      const count = await this.prisma.crewMember.count({
        where: { id: { in: equipeIds }, accountId },
      });
      if (count !== equipeIds.length) {
        throw new BadRequestException('equipeIds invalido');
      }
    }
  }
}

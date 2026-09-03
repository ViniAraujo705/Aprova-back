import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RecordingEventTipo, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleCalendarSyncService } from '../google-calendar/google-calendar-sync.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PlansService } from '../plans/plans.service';
import { CreateRecordingEventDto } from './dto/create-recording-event.dto';
import { UpdateRecordingEventDto } from './dto/update-recording-event.dto';
import { NotifyRecordingEventDto } from './dto/notify-recording-event.dto';

const RECORDING_EVENT_SELECT = {
  id: true,
  titulo: true,
  tipo: true,
  dataInicio: true,
  dataFim: true,
  clienteId: true,
  membroId: true,
  demandaId: true,
  observacoes: true,
  cliente: { select: { nome: true } },
  membro: { select: { nome: true } },
  equipe: {
    select: { crewMember: { select: { id: true, nome: true, userId: true } } },
  },
} as const;

export type RawRecordingEvent = {
  id: string;
  titulo: string;
  tipo: RecordingEventTipo;
  dataInicio: Date;
  dataFim: Date | null;
  clienteId: string | null;
  membroId: string | null;
  demandaId: string | null;
  observacoes: string | null;
  cliente: { nome: string } | null;
  membro: { nome: string } | null;
  equipe: { crewMember: { id: string; nome: string; userId: string | null } }[];
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly googleSync: GoogleCalendarSyncService,
    private readonly notifications: NotificationsService,
    private readonly plans: PlansService,
  ) {}

  async create(accountId: string, dto: CreateRecordingEventDto) {
    await this.plans.assertLevelFeature(accountId, 'recordingManagement');
    await this.assertRefsBelongToAccount(accountId, dto);
    const equipeIds = dto.equipeIds ? dedupe(dto.equipeIds) : [];
    const demandaId = await this.resolveDemandaId(accountId, dto.demandaId);

    const event = await this.prisma.recordingEvent.create({
      data: {
        accountId,
        titulo: dto.titulo,
        tipo: dto.tipo ?? RecordingEventTipo.gravacao,
        dataInicio: new Date(dto.dataInicio),
        dataFim: dto.dataFim ? new Date(dto.dataFim) : null,
        clienteId: dto.clienteId ?? null,
        membroId: dto.membroId ?? null,
        demandaId,
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
    await this.googleSync.syncOnCreate(event);
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
    return toDto(await this.findRaw(accountId, id));
  }

  private async findRaw(
    accountId: string,
    id: string,
  ): Promise<RawRecordingEvent> {
    const event = await this.prisma.recordingEvent.findFirst({
      where: { id, accountId },
      select: RECORDING_EVENT_SELECT,
    });
    if (!event) {
      throw new NotFoundException('Evento de gravacao nao encontrado');
    }
    return event;
  }

  async update(accountId: string, id: string, dto: UpdateRecordingEventDto) {
    // Garante que o evento pertence a conta antes de atualizar - shape cru
    // (nao o DTO) porque o sync com o Google Calendar precisa comparar
    // destinatarios antes/depois (membroId + equipe[].crewMember.userId).
    const oldEvent = await this.findRaw(accountId, id);
    await this.assertRefsBelongToAccount(accountId, dto);
    const equipeIds =
      dto.equipeIds !== undefined ? dedupe(dto.equipeIds) : undefined;
    const demandaId =
      dto.demandaId !== undefined
        ? await this.resolveDemandaId(accountId, dto.demandaId)
        : undefined;

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
          ...(dto.tipo !== undefined ? { tipo: dto.tipo } : {}),
          ...(dto.dataInicio !== undefined
            ? { dataInicio: new Date(dto.dataInicio) }
            : {}),
          ...(dto.dataFim !== undefined
            ? { dataFim: dto.dataFim ? new Date(dto.dataFim) : null }
            : {}),
          ...(dto.clienteId !== undefined ? { clienteId: dto.clienteId } : {}),
          ...(dto.membroId !== undefined ? { membroId: dto.membroId } : {}),
          ...(demandaId !== undefined ? { demandaId } : {}),
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
    await this.googleSync.syncOnUpdate(oldEvent, event);
    return toDto(event);
  }

  async remove(accountId: string, id: string) {
    await this.findRaw(accountId, id);
    // Le as linhas de sync ANTES de apagar o evento - o cascade do banco
    // (onDelete: Cascade em RecordingEventGoogleSync) ja teria apagado
    // essas linhas se lidas depois.
    const syncRows = await this.prisma.recordingEventGoogleSync.findMany({
      where: { recordingEventId: id },
      select: { userId: true, googleEventId: true },
    });
    await this.prisma.recordingEvent.delete({ where: { id } });
    await this.googleSync.syncOnDelete(syncRows);
    return { deleted: true };
  }

  async notify(
    accountId: string,
    id: string,
    dto: NotifyRecordingEventDto,
  ): Promise<{ notificados: number }> {
    const event = await this.findRaw(accountId, id);
    const requestedIds = dedupe(dto.equipeIds);
    const crewById = new Map(
      event.equipe.map(({ crewMember }) => [crewMember.id, crewMember]),
    );
    const invalidId = requestedIds.find(
      (crewMemberId) => !crewById.has(crewMemberId),
    );
    if (invalidId) {
      throw new BadRequestException(
        'equipeIds deve conter apenas membros vinculados ao evento',
      );
    }

    const userIds = requestedIds
      .map((crewMemberId) => crewById.get(crewMemberId)?.userId)
      .filter((userId): userId is string => !!userId);
    const owners = await this.prisma.membership.findMany({
      where: { accountId, role: UserRole.owner },
      select: { userId: true },
    });
    const recipientIds = [
      ...owners.map((owner) => owner.userId),
      ...(event.membroId ? [event.membroId] : []),
      ...userIds,
    ];
    const notificados = await this.notifications.notifyRecordingEvent(
      accountId,
      event.id,
      recipientIds,
    );
    return { notificados };
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
      const membro = await this.prisma.membership.findFirst({
        where: { userId: dto.membroId, accountId },
        select: { userId: true },
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

  /** Demanda ausente, excluida ou de outra conta vira um vinculo nulo. */
  private async resolveDemandaId(
    accountId: string,
    demandaId: string | null | undefined,
  ): Promise<string | null> {
    if (!demandaId) return null;
    const demanda = await this.prisma.demanda.findFirst({
      where: { id: demandaId, accountId },
      select: { id: true },
    });
    return demanda?.id ?? null;
  }
}

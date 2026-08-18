import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CalendarEventPayload,
  GoogleCalendarOAuthService,
} from './google-calendar-oauth.service';
import type { RawRecordingEvent } from '../recording-events/recording-events.service';

// Usado quando o RecordingEvent nao tem dataFim (campo opcional).
const DEFAULT_DURATION_MS = 60 * 60 * 1000;

/**
 * Sync unidirecional (Aprova -> Google) do calendario de gravacoes:
 * quando um RecordingEvent e criado/editado/apagado, cria/atualiza/apaga o
 * evento correspondente no Google Calendar pessoal de cada destinatario
 * (membro responsavel + equipe com CrewMember.userId vinculado - mesmo
 * fan-out usado em NotificationsService.sendRecordingReminders). So
 * sincroniza quem tem GoogleCalendarConnection; os demais sao ignorados
 * silenciosamente. Best-effort: nenhum metodo publico aqui lanca - falha de
 * um destinatario nao afeta os outros nem o fluxo de RecordingEventsService
 * que chamou.
 */
@Injectable()
export class GoogleCalendarSyncService {
  private readonly logger = new Logger(GoogleCalendarSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly oauth: GoogleCalendarOAuthService,
  ) {}

  async syncOnCreate(event: RawRecordingEvent): Promise<void> {
    for (const userId of this.resolveRecipients(event)) {
      await this.createForRecipient(event, userId);
    }
  }

  async syncOnUpdate(
    oldEvent: RawRecordingEvent,
    newEvent: RawRecordingEvent,
  ): Promise<void> {
    const oldRecipients = this.resolveRecipients(oldEvent);
    const newRecipients = this.resolveRecipients(newEvent);
    const removed = oldRecipients.filter((id) => !newRecipients.includes(id));
    const kept = newRecipients.filter((id) => oldRecipients.includes(id));
    const added = newRecipients.filter((id) => !oldRecipients.includes(id));

    for (const userId of removed) {
      await this.deleteForRecipient(newEvent.id, userId);
    }
    for (const userId of added) {
      await this.createForRecipient(newEvent, userId);
    }
    for (const userId of kept) {
      await this.updateForRecipient(newEvent, userId);
    }
  }

  /**
   * As linhas de sync precisam ser lidas ANTES do RecordingEvent ser
   * apagado - o cascade do banco (onDelete: Cascade em
   * RecordingEventGoogleSync) ja teria apagado essas linhas no momento em
   * que este metodo roda. Ver RecordingEventsService.remove.
   */
  async syncOnDelete(
    syncRows: { userId: string; googleEventId: string }[],
  ): Promise<void> {
    for (const row of syncRows) {
      try {
        const connection =
          await this.prisma.googleCalendarConnection.findUnique({
            where: { userId: row.userId },
          });
        if (!connection) continue;
        const accessToken = await this.oauth.getValidAccessToken(
          connection.refreshTokenEnc,
        );
        await this.oauth.deleteEvent(accessToken, row.googleEventId);
      } catch (err) {
        this.logFailure('apagar', row.googleEventId, err);
      }
    }
  }

  private resolveRecipients(event: RawRecordingEvent): string[] {
    const ids = [
      event.membroId,
      ...event.equipe.map((e) => e.crewMember.userId),
    ].filter((id): id is string => !!id);
    return Array.from(new Set(ids));
  }

  private toPayload(event: RawRecordingEvent): CalendarEventPayload {
    const start = event.dataInicio;
    const end =
      event.dataFim ?? new Date(start.getTime() + DEFAULT_DURATION_MS);
    const description = [
      event.observacoes,
      event.cliente?.nome ? `Cliente: ${event.cliente.nome}` : null,
    ]
      .filter(Boolean)
      .join('\n');
    return {
      summary: event.titulo,
      description: description || undefined,
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
    };
  }

  private async createForRecipient(
    event: RawRecordingEvent,
    userId: string,
  ): Promise<void> {
    try {
      const connection = await this.prisma.googleCalendarConnection.findUnique({
        where: { userId },
      });
      if (!connection) return;
      const accessToken = await this.oauth.getValidAccessToken(
        connection.refreshTokenEnc,
      );
      const created = await this.oauth.insertEvent(
        accessToken,
        this.toPayload(event),
      );
      await this.prisma.recordingEventGoogleSync.upsert({
        where: {
          recordingEventId_userId: { recordingEventId: event.id, userId },
        },
        create: {
          recordingEventId: event.id,
          userId,
          googleEventId: created.id,
        },
        update: { googleEventId: created.id },
      });
    } catch (err) {
      this.logFailure('criar', event.id, err);
    }
  }

  private async updateForRecipient(
    event: RawRecordingEvent,
    userId: string,
  ): Promise<void> {
    try {
      const [connection, sync] = await Promise.all([
        this.prisma.googleCalendarConnection.findUnique({ where: { userId } }),
        this.prisma.recordingEventGoogleSync.findUnique({
          where: {
            recordingEventId_userId: { recordingEventId: event.id, userId },
          },
        }),
      ]);
      if (!connection) return;
      if (!sync) {
        // Nunca sincronizado antes (ex.: conectou a conta entre um update e
        // outro, ainda sem linha em RecordingEventGoogleSync) - cria.
        await this.createForRecipient(event, userId);
        return;
      }
      const accessToken = await this.oauth.getValidAccessToken(
        connection.refreshTokenEnc,
      );
      await this.oauth.updateEvent(
        accessToken,
        sync.googleEventId,
        this.toPayload(event),
      );
    } catch (err) {
      this.logFailure('atualizar', event.id, err);
    }
  }

  private async deleteForRecipient(
    recordingEventId: string,
    userId: string,
  ): Promise<void> {
    try {
      const [connection, sync] = await Promise.all([
        this.prisma.googleCalendarConnection.findUnique({ where: { userId } }),
        this.prisma.recordingEventGoogleSync.findUnique({
          where: { recordingEventId_userId: { recordingEventId, userId } },
        }),
      ]);
      if (sync) {
        await this.prisma.recordingEventGoogleSync.delete({
          where: { id: sync.id },
        });
      }
      if (!connection || !sync) return;
      const accessToken = await this.oauth.getValidAccessToken(
        connection.refreshTokenEnc,
      );
      await this.oauth.deleteEvent(accessToken, sync.googleEventId);
    } catch (err) {
      this.logFailure('remover destinatario de', recordingEventId, err);
    }
  }

  private logFailure(action: string, ref: string, err: unknown): void {
    const message = err instanceof Error ? err.message : 'erro desconhecido';
    this.logger.warn(
      `Sync com Google Calendar falhou ao ${action} (ref ${ref}): ${message}`,
    );
  }
}

import { Injectable, Logger } from '@nestjs/common';
import {
  ClientActivityAtorTipo,
  ClientActivityType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface LogClientActivityParams {
  accountId: string;
  clienteId: string;
  tipo: ClientActivityType;
  atorTipo: ClientActivityAtorTipo;
  atorNome?: string | null;
  videoId?: string | null;
  projectId?: string | null;
  arquivoId?: string | null;
  descricao?: string | null;
  metadados?: Prisma.InputJsonValue;
}

const ACTIVITY_SELECT = {
  id: true,
  accountId: true,
  clienteId: true,
  tipo: true,
  atorTipo: true,
  atorNome: true,
  videoId: true,
  projectId: true,
  arquivoId: true,
  descricao: true,
  metadados: true,
  criadoEm: true,
} as const;

/**
 * Trilha de auditoria append-only da central do cliente. Escrita sempre
 * best-effort (mesmo molde de NotificationsService.notify): chamada depois
 * que a acao principal ja foi persistida, nunca pode derrubar a resposta de
 * uma acao que ja aconteceu.
 */
@Injectable()
export class ClientActivityService {
  private readonly logger = new Logger(ClientActivityService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(params: LogClientActivityParams): Promise<void> {
    try {
      await this.prisma.clientActivity.create({
        data: {
          accountId: params.accountId,
          clienteId: params.clienteId,
          tipo: params.tipo,
          atorTipo: params.atorTipo,
          atorNome: params.atorNome ?? null,
          videoId: params.videoId ?? null,
          projectId: params.projectId ?? null,
          arquivoId: params.arquivoId ?? null,
          descricao: params.descricao ?? null,
          metadados: params.metadados,
        },
      });
    } catch (err) {
      this.logger.error(
        `Falha ao registrar ClientActivity (tipo=${params.tipo}, clienteId=${params.clienteId})`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  /**
   * Lista paginada por cursor (mais recente primeiro). cursor e o id do
   * ultimo item recebido pelo frontend; limit default 30 (ver spec do
   * frontend para a central do cliente).
   */
  async findByClient(
    accountId: string,
    clienteId: string,
    cursor?: string,
    limit = 30,
  ) {
    const items = await this.prisma.clientActivity.findMany({
      where: { accountId, clienteId },
      orderBy: { criadoEm: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: ACTIVITY_SELECT,
    });

    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;

    return {
      items: page,
      nextCursor: hasMore ? page[page.length - 1].id : undefined,
    };
  }
}

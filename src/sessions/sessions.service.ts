import { Injectable, NotFoundException } from '@nestjs/common';
import { Session } from '@prisma/client';
import { UAParser } from 'ua-parser-js';
import { PrismaService } from '../prisma/prisma.service';

export type TipoDispositivo = 'desktop' | 'mobile' | 'tablet';

export interface SessionMeta {
  userAgent?: string;
  ip?: string;
}

export interface SessionResponseDto {
  id: string;
  dispositivo: string;
  tipoDispositivo: TipoDispositivo;
  localizacao: string | null;
  ip: string | null;
  criadoEm: Date;
  ultimoAcessoEm: Date;
  atual: boolean;
}

/**
 * Uma linha por login bem-sucedido (ver Session no schema). Alimenta a tela
 * de "sessoes ativas": listar dispositivos logados e permitir revogar
 * (apagar a linha) antes do JWT expirar sozinho.
 */
@Injectable()
export class SessionsService {
  // So atualiza ultimo_acesso_em se fizer mais tempo que isso desde a
  // ultima atualizacao, para nao virar um UPDATE a cada request autenticado.
  private readonly TOUCH_THROTTLE_MS = 5 * 60 * 1000;

  constructor(private readonly prisma: PrismaService) {}

  async createSession(userId: string, meta: SessionMeta): Promise<Session> {
    return this.prisma.session.create({
      data: {
        userId,
        userAgent: meta.userAgent ?? null,
        ip: meta.ip ?? null,
      },
    });
  }

  /**
   * Atualiza ultimo_acesso_em de forma best-effort (nao bloqueia a
   * request que chamou): se der erro (ex.: sessao apagada entre o guard
   * validar e este update rodar), so ignora.
   */
  touchSession(session: Pick<Session, 'id' | 'ultimoAcessoEm'>): void {
    const jaFazTempo =
      Date.now() - session.ultimoAcessoEm.getTime() > this.TOUCH_THROTTLE_MS;
    if (!jaFazTempo) return;

    void this.prisma.session
      .update({
        where: { id: session.id },
        data: { ultimoAcessoEm: new Date() },
      })
      .catch(() => {});
  }

  async listForUser(
    userId: string,
    currentSessionId: string | null,
  ): Promise<SessionResponseDto[]> {
    const sessions = await this.prisma.session.findMany({
      where: { userId },
      orderBy: { ultimoAcessoEm: 'desc' },
    });
    return sessions.map((session) => this.toDto(session, currentSessionId));
  }

  /**
   * Apaga uma sessao pelo dono (userId). Usado tanto para "apagar minha
   * sessao X" quanto para o owner apagar a sessao X de um membro - em
   * ambos os casos a regra e a mesma: so apaga se pertencer ao userId.
   */
  async deleteById(userId: string, sessionId: string): Promise<void> {
    const result = await this.prisma.session.deleteMany({
      where: { id: sessionId, userId },
    });
    if (result.count === 0) {
      throw new NotFoundException('Sessao nao encontrada');
    }
  }

  async deleteAllExceptCurrent(
    userId: string,
    currentSessionId: string,
  ): Promise<void> {
    await this.prisma.session.deleteMany({
      where: { userId, id: { not: currentSessionId } },
    });
  }

  async deleteAllOfUser(userId: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { userId } });
  }

  private toDto(
    session: Session,
    currentSessionId: string | null,
  ): SessionResponseDto {
    const { browser, os, device } = UAParser(session.userAgent ?? '');
    const dispositivo = `${browser.name ?? 'Navegador'} · ${os.name ?? 'Desconhecido'}`;

    return {
      id: session.id,
      dispositivo,
      tipoDispositivo: this.tipoDispositivoFor(device.type),
      localizacao: null,
      ip: session.ip,
      criadoEm: session.criadoEm,
      ultimoAcessoEm: session.ultimoAcessoEm,
      atual: session.id === currentSessionId,
    };
  }

  private tipoDispositivoFor(deviceType?: string): TipoDispositivo {
    if (deviceType === 'mobile') return 'mobile';
    if (deviceType === 'tablet') return 'tablet';
    return 'desktop';
  }
}

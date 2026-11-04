import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { NotificationType, Prisma, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { resolveFrontendUrl } from '../common/frontend-url.util';

const TIME_ZONE = 'America/Sao_Paulo';
const HOUR_MS = 60 * 60 * 1000;

// Vao por e-mail na hora; todo o resto espera o resumo diario.
const IMEDIATOS: NotificationType[] = [
  NotificationType.aprovacao_cliente,
  NotificationType.prazo_vencido,
];

// Aviso imediato que ficou mais velho que isso (ex.: app fora do ar) cai
// para o resumo em vez de chegar atrasado como se fosse novidade.
const IMEDIATO_JANELA_MS = 2 * HOUR_MS;
// O resumo cobre a ultima semana do que ainda nao foi lido nem enviado.
const RESUMO_JANELA_MS = 7 * 24 * HOUR_MS;

const EMAIL_SELECT = {
  id: true,
  userId: true,
  type: true,
  criadoEm: true,
  user: {
    select: {
      email: true,
      nome: true,
      status: true,
      emailResumoDiario: true,
      emailImediato: true,
      emailTiposDesligados: true,
    },
  },
  video: {
    select: {
      id: true,
      nomeArquivo: true,
      deadline: true,
      project: {
        select: {
          nome: true,
          contatoAvulso: true,
          client: { select: { nome: true } },
        },
      },
    },
  },
  demanda: { select: { id: true, titulo: true, prazo: true } },
  recordingEvent: { select: { titulo: true, dataInicio: true } },
} as const;

type EmailNotification = Awaited<
  ReturnType<NotificationEmailService['load']>
>[number];

/**
 * Notificacoes por e-mail. Aprovacao do cliente e prazo vencido vao na hora;
 * o resto vai num resumo por dia, as 8h de Brasilia. Cada pessoa escolhe em
 * Configuracoes (User.emailImediato / emailResumoDiario /
 * emailTiposDesligados).
 *
 * `Notification.emailEnviadoEm` marca o que ja foi enviado. A marcacao e
 * feita ANTES de enviar (updateMany condicionado a null), para duas
 * execucoes do cron nunca mandarem o mesmo aviso duas vezes; se o envio
 * falhar, o aviso fica no sininho mas nao e reenviado por e-mail.
 */
@Injectable()
export class NotificationEmailService {
  private readonly logger = new Logger(NotificationEmailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  @Cron('*/2 * * * *')
  async sendImmediate(): Promise<void> {
    try {
      const candidates = await this.load({
        type: { in: IMEDIATOS },
        criadoEm: { gte: new Date(Date.now() - IMEDIATO_JANELA_MS) },
      });
      const eligible = candidates.filter(
        (n) =>
          n.user.emailImediato &&
          n.user.status === UserStatus.ativo &&
          !n.user.emailTiposDesligados.includes(n.type),
      );
      await this.sendGrouped(eligible, (items) =>
        items.length === 1
          ? this.immediateSubject(items[0])
          : `${items.length} avisos no Check`,
      );
    } catch (err) {
      this.logger.error(
        'Falha ao enviar avisos imediatos por e-mail',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  @Cron('0 8 * * *', { timeZone: TIME_ZONE })
  async sendDailyDigest(): Promise<void> {
    try {
      const candidates = await this.load({
        lida: false,
        criadoEm: { gte: new Date(Date.now() - RESUMO_JANELA_MS) },
      });
      const eligible = candidates.filter(
        (n) =>
          n.user.emailResumoDiario &&
          n.user.status === UserStatus.ativo &&
          !n.user.emailTiposDesligados.includes(n.type),
      );
      await this.sendGrouped(eligible, (items) =>
        items.length === 1
          ? 'Resumo do dia no Check: 1 novidade'
          : `Resumo do dia no Check: ${items.length} novidades`,
      );
    } catch (err) {
      this.logger.error(
        'Falha ao enviar o resumo diario por e-mail',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  private load(where: Prisma.NotificationWhereInput) {
    return this.prisma.notification.findMany({
      where: { ...where, emailEnviadoEm: null },
      orderBy: { criadoEm: 'asc' },
      take: 2000,
      select: EMAIL_SELECT,
    });
  }

  private async sendGrouped(
    notifications: EmailNotification[],
    subject: (items: EmailNotification[]) => string,
  ): Promise<void> {
    const byUser = new Map<string, EmailNotification[]>();
    for (const n of notifications) {
      byUser.set(n.userId, [...(byUser.get(n.userId) ?? []), n]);
    }

    for (const [userId, items] of byUser) {
      const stamp = new Date();
      const ids = items.map((n) => n.id);
      await this.prisma.notification.updateMany({
        where: { id: { in: ids }, emailEnviadoEm: null },
        data: { emailEnviadoEm: stamp },
      });
      const claimed = await this.prisma.notification.findMany({
        where: { id: { in: ids }, emailEnviadoEm: stamp },
        select: { id: true },
      });
      const claimedIds = new Set(claimed.map((c) => c.id));
      const mine = items.filter((n) => claimedIds.has(n.id));
      if (mine.length === 0) continue;

      try {
        await this.mail.send(
          mine[0].user.email,
          subject(mine),
          this.body(mine[0].user.nome, mine),
        );
      } catch (err) {
        this.logger.warn(
          `Falha ao enviar e-mail de notificacao (userId=${userId}): ${
            (err as Error).message
          }`,
        );
      }
    }
  }

  private immediateSubject(n: EmailNotification): string {
    if (n.type === NotificationType.aprovacao_cliente) {
      return `Aprovado: ${n.video?.nomeArquivo ?? 'vídeo'}`;
    }
    return `Prazo vencido: ${n.video?.nomeArquivo ?? n.demanda?.titulo ?? ''}`;
  }

  private body(nome: string, items: EmailNotification[]): string {
    const front = resolveFrontendUrl(this.config);
    const primeiroNome = nome.split(' ')[0] || nome;
    const linhas = items.map((n) => {
      const link = n.video
        ? `${front}/videos/${n.video.id}/revisao`
        : n.demanda
          ? `${front}/kanban`
          : `${front}/calendario`;
      return `- ${this.describe(n)}\n  ${link}`;
    });
    return [
      `Olá, ${primeiroNome}!`,
      '',
      items.length === 1
        ? 'Tem uma novidade no Check:'
        : 'Estas são as novidades no Check:',
      '',
      ...linhas,
      '',
      `Ver todas as notificações: ${front}/notificacoes`,
      '',
      `Para escolher o que chega por e-mail: ${front}/configuracoes#notificacoes`,
    ].join('\n');
  }

  private describe(n: EmailNotification): string {
    const video = n.video ? `"${n.video.nomeArquivo}"` : '';
    const cliente =
      n.video?.project.client?.nome ??
      n.video?.project.contatoAvulso ??
      'O cliente';
    const tituloPrazo = n.video ? video : `"${n.demanda?.titulo ?? ''}"`;
    const prazo = n.video?.deadline ?? n.demanda?.prazo ?? null;

    switch (n.type) {
      case NotificationType.comentario_cliente:
        return `${cliente} comentou em ${video}`;
      case NotificationType.aprovacao_cliente:
        return `${cliente} aprovou ${video}`;
      case NotificationType.ajuste_solicitado:
        return `${cliente} pediu ajuste em ${video}`;
      case NotificationType.avaliacao_cliente:
        return `${cliente} avaliou ${video}`;
      case NotificationType.prazo_proximo:
        return `O prazo de ${tituloPrazo} vence ${this.when(prazo)}`;
      case NotificationType.prazo_vencido:
        return `O prazo de ${tituloPrazo} venceu ${this.when(prazo)}`;
      case NotificationType.nova_demanda:
        return `Nova demanda para você: "${n.demanda?.titulo ?? ''}"`;
      case NotificationType.aguardando_cliente:
        return `${video} está esperando resposta de ${cliente} há 3 dias`;
      case NotificationType.lembrete_gravacao:
        return `Gravação "${n.recordingEvent?.titulo ?? ''}" ${this.when(
          n.recordingEvent?.dataInicio ?? null,
        )}`;
      default:
        return 'Nova notificação';
    }
  }

  private when(date: Date | null): string {
    if (!date) return '';
    return `em ${date.toLocaleDateString('pt-BR', {
      timeZone: TIME_ZONE,
      day: '2-digit',
      month: '2-digit',
    })}`;
  }
}

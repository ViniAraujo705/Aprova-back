import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InviteStatus, UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { CreateInviteDto } from './dto/create-invite.dto';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { toMemberDto } from '../common/dto/team-role.util';
import { SessionMeta, SessionsService } from '../sessions/sessions.service';

@Injectable()
export class AccountService {
  private readonly SALT_ROUNDS = 10;
  private readonly logger = new Logger(AccountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly sessions: SessionsService,
  ) {}

  /**
   * Cria um convite pendente de editor para a conta do owner e "envia" o
   * email (aqui, simulado via log). O link aponta para o fluxo publico de
   * aceite (/convite/:token).
   */
  async invite(accountId: string, dto: CreateInviteDto) {
    const email = dto.email.toLowerCase();

    // Ja existe um usuario com este email (em qualquer conta)?
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existingUser) {
      throw new ConflictException('Ja existe um usuario com este email');
    }

    // Ja existe um convite pendente para este email nesta conta?
    const pending = await this.prisma.invite.findFirst({
      where: { accountId, email, status: InviteStatus.pendente },
      select: { id: true },
    });
    if (pending) {
      throw new ConflictException(
        'Ja existe um convite pendente para este email',
      );
    }

    const invite = await this.prisma.invite.create({
      data: { accountId, email },
      select: {
        id: true,
        email: true,
        status: true,
        token: true,
        criadoEm: true,
      },
    });

    const inviteUrl = this.buildInviteUrl(invite.token);
    // Envio de email simulado — em producao trocar por um provedor real.
    this.logger.log(
      `[EMAIL SIMULADO] Convite para ${invite.email}. Link de aceite: ${inviteUrl}`,
    );

    return {
      id: invite.id,
      email: invite.email,
      status: invite.status,
      criadoEm: invite.criadoEm,
      // Exposto para facilitar teste/integracao enquanto o envio e simulado.
      inviteUrl,
    };
  }

  /**
   * Aceite publico do convite: cria o usuario editor vinculado a conta do
   * convite e marca o convite como aceito. Endpoint sem autenticacao.
   */
  async acceptInvite(token: string, dto: AcceptInviteDto, meta: SessionMeta) {
    const invite = await this.prisma.invite.findUnique({
      where: { token },
    });
    if (!invite || invite.status !== InviteStatus.pendente) {
      throw new NotFoundException('Convite invalido ou ja utilizado');
    }

    // O email pode ter sido cadastrado por outro caminho nesse meio tempo.
    const existingUser = await this.prisma.user.findUnique({
      where: { email: invite.email },
      select: { id: true },
    });
    if (existingUser) {
      throw new ConflictException('Ja existe um usuario com este email');
    }

    const senhaHash = await bcrypt.hash(dto.senha, this.SALT_ROUNDS);

    // Cria o editor e marca o convite como aceito na mesma transacao.
    const [user] = await this.prisma.$transaction([
      this.prisma.user.create({
        data: {
          nome: dto.nome,
          email: invite.email,
          senha: senhaHash,
          role: UserRole.editor,
          accountId: invite.accountId,
        },
        select: {
          id: true,
          nome: true,
          email: true,
          role: true,
          status: true,
          accountId: true,
          criadoEm: true,
        },
      }),
      this.prisma.invite.update({
        where: { id: invite.id },
        data: { status: InviteStatus.aceito },
      }),
    ]);

    const session = await this.sessions.createSession(user.id, meta);

    return {
      user: toMemberDto(user),
      access_token: this.jwt.sign({
        sub: user.id,
        email: user.email,
        role: user.role,
        accountId: user.accountId,
        sid: session.id,
      }),
    };
  }

  /**
   * Owner cancela um convite pendente da propria conta. So convites com
   * status pendente podem ser cancelados; ja aceitos viram 400.
   */
  async cancelInvite(accountId: string, inviteId: string) {
    const invite = await this.prisma.invite.findFirst({
      where: { id: inviteId, accountId },
      select: { id: true, status: true },
    });
    if (!invite) {
      throw new NotFoundException('Convite nao encontrado nesta conta');
    }
    if (invite.status !== InviteStatus.pendente) {
      throw new BadRequestException('Convite ja foi aceito ou cancelado');
    }

    await this.prisma.invite.update({
      where: { id: invite.id },
      data: { status: InviteStatus.cancelado },
    });
  }

  /**
   * Owner dispara o e-mail real de convite (via provedor transacional) para
   * o endereco do convite. So funciona para convites ainda pendentes.
   */
  async sendInviteEmail(accountId: string, inviteId: string) {
    const invite = await this.prisma.invite.findFirst({
      where: { id: inviteId, accountId },
      select: { id: true, email: true, status: true, token: true },
    });
    if (!invite) {
      throw new NotFoundException('Convite nao encontrado nesta conta');
    }
    if (invite.status !== InviteStatus.pendente) {
      throw new ConflictException(
        'Convite ja foi aceito ou cancelado, nao e possivel reenviar',
      );
    }

    const inviteUrl = this.buildInviteUrl(invite.token);
    await this.mail.send(
      invite.email,
      'Convite para colaborar na Vistoow',
      `Voce foi convidado(a) para colaborar como editor na APROVA. Acesse o link abaixo para criar sua senha:\n${inviteUrl}`,
    );

    return { sent: true };
  }

  /** Lista os membros (owner + editores) da conta. */
  async listMembers(accountId: string) {
    const members = await this.prisma.user.findMany({
      where: { accountId },
      orderBy: [{ role: 'asc' }, { criadoEm: 'asc' }],
      select: {
        id: true,
        nome: true,
        email: true,
        role: true,
        status: true,
        criadoEm: true,
      },
    });
    return members.map(toMemberDto);
  }

  /**
   * Owner remove/suspende (ou reativa) um membro da propria conta. Editores
   * podem ser suspensos livremente; um owner so pode ser suspenso se sobrar
   * pelo menos outro owner ativo na conta (a conta nunca pode ficar sem
   * nenhum owner ativo).
   */
  async setMemberStatus(
    accountId: string,
    memberId: string,
    status: UserStatus,
  ) {
    const member = await this.prisma.user.findFirst({
      where: { id: memberId, accountId },
      select: { id: true, role: true, status: true },
    });
    if (!member) {
      throw new NotFoundException('Membro nao encontrado nesta conta');
    }

    if (
      member.role === UserRole.owner &&
      status === UserStatus.suspenso &&
      member.status !== UserStatus.suspenso
    ) {
      const outrosOwnersAtivos = await this.prisma.user.count({
        where: {
          accountId,
          role: UserRole.owner,
          status: UserStatus.ativo,
          id: { not: member.id },
        },
      });
      if (outrosOwnersAtivos === 0) {
        throw new BadRequestException(
          'Nao e possivel suspender o unico owner ativo da conta',
        );
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: member.id },
      data: { status },
      select: { id: true, nome: true, email: true, role: true, status: true },
    });
    return toMemberDto(updated);
  }

  /**
   * Owner promove um editor ativo a owner. Nao suporta rebaixar (owner ->
   * editor) - a conta pode ter mais de um owner simultaneamente.
   */
  async promoteMemberToOwner(accountId: string, memberId: string) {
    const member = await this.prisma.user.findFirst({
      where: { id: memberId, accountId },
      select: { id: true, role: true, status: true },
    });
    if (!member) {
      throw new NotFoundException('Membro nao encontrado nesta conta');
    }
    if (member.role !== UserRole.editor) {
      throw new BadRequestException('Membro ja e owner');
    }
    if (member.status !== UserStatus.ativo) {
      throw new BadRequestException(
        'Apenas editores ativos podem ser promovidos a owner',
      );
    }

    const updated = await this.prisma.user.update({
      where: { id: member.id },
      data: { role: UserRole.owner },
      select: { id: true, nome: true, email: true, role: true, status: true },
    });
    return toMemberDto(updated);
  }

  /** Owner lista as sessoes ativas (dispositivos logados) de um membro. */
  async listMemberSessions(accountId: string, memberId: string) {
    await this.assertMember(accountId, memberId);
    // "atual" nunca se aplica aqui: e sempre a sessao de outra pessoa.
    return this.sessions.listForUser(memberId, null);
  }

  /** Owner encerra remotamente uma sessao especifica de um membro. */
  async deleteMemberSession(
    accountId: string,
    memberId: string,
    sessionId: string,
  ) {
    await this.assertMember(accountId, memberId);
    return this.sessions.deleteById(memberId, sessionId);
  }

  /** Owner encerra todas as sessoes de um membro (sem excecao). */
  async deleteAllMemberSessions(accountId: string, memberId: string) {
    await this.assertMember(accountId, memberId);
    return this.sessions.deleteAllOfUser(memberId);
  }

  /**
   * Confere que memberId pertence a mesma conta/agencia do owner
   * autenticado - nunca deixa vazar/mexer em membro de outra agencia.
   */
  private async assertMember(
    accountId: string,
    memberId: string,
  ): Promise<void> {
    const member = await this.prisma.user.findFirst({
      where: { id: memberId, accountId },
      select: { id: true },
    });
    if (!member) {
      throw new NotFoundException('Membro nao encontrado nesta conta');
    }
  }

  private buildInviteUrl(token: string): string {
    const base = (this.config.get<string>('CORS_ORIGIN') ?? '')
      .split(',')[0]
      .trim();
    const origin = base && base !== '*' ? base : 'http://localhost:5173';
    return `${origin}/convite/${token}`;
  }
}

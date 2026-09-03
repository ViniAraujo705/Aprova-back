import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
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
import { resolveOwnerBranding } from '../common/account-branding.util';
import { SessionMeta, SessionsService } from '../sessions/sessions.service';
import { PlansService } from '../plans/plans.service';

@Injectable()
export class AccountService {
  private readonly SALT_ROUNDS = 10;
  private readonly INVITE_TTL_MS = 3 * 24 * 60 * 60 * 1000; // 3 dias
  private readonly logger = new Logger(AccountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly sessions: SessionsService,
    private readonly plans: PlansService,
  ) {}

  /**
   * Cria um convite pendente de editor para a conta do owner e "envia" o
   * email (aqui, simulado via log). O link aponta para o fluxo publico de
   * aceite (/convite/:token).
   */
  async invite(accountId: string, dto: CreateInviteDto) {
    await this.plans.assertCanInviteEditor(accountId);

    const email = dto.email.toLowerCase();

    // Ja existe um usuario com este email (em qualquer conta - pode ja ser
    // owner/editor de outra agencia)? So bloqueia se ele ja for membro
    // ativo desta conta especifica - o aceite (acceptInvite) trata o resto:
    // confirma a identidade pela senha e so cria o Membership novo, sem
    // duplicar o User.
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existingUser) {
      const activeMembership = await this.prisma.membership.findUnique({
        where: {
          userId_accountId: { userId: existingUser.id, accountId },
        },
        select: { status: true },
      });
      if (activeMembership?.status === UserStatus.ativo) {
        throw new ConflictException('Este usuario ja e membro desta conta');
      }
    }

    // Ja existe um convite pendente para este email nesta conta? Convite
    // pendente mas ja expirado nao bloqueia: e cancelado automaticamente
    // para abrir espaco para o novo.
    const pending = await this.prisma.invite.findFirst({
      where: { accountId, email, status: InviteStatus.pendente },
      select: { id: true, expiresEm: true },
    });
    if (pending) {
      if (pending.expiresEm > new Date()) {
        throw new ConflictException(
          'Ja existe um convite pendente para este email',
        );
      }
      await this.prisma.invite.update({
        where: { id: pending.id },
        data: { status: InviteStatus.cancelado },
      });
    }

    const invite = await this.prisma.invite.create({
      data: {
        accountId,
        email,
        expiresEm: new Date(Date.now() + this.INVITE_TTL_MS),
      },
      select: {
        id: true,
        email: true,
        status: true,
        token: true,
        expiresEm: true,
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
      // Convidado ainda nao tem conta, entao nao tem avatar - o campo vem
      // mesmo assim para o front montar a linha nova sem tratar ausencia.
      fotoUrl: null,
      criadoEm: invite.criadoEm,
      expiresAt: invite.expiresEm,
      // Exposto para facilitar teste/integracao enquanto o envio e simulado.
      inviteUrl,
    };
  }

  /**
   * Aceite publico do convite: liga o convidado (novo ou ja existente em
   * outra conta) a agencia do convite como editor e marca o convite como
   * aceito. Endpoint sem autenticacao - ramifica em 3 casos conforme o
   * email do convite ja tem User ou nao:
   * - email novo: cria o User (com a senha nova de dto.senha) + Membership;
   * - email existente com senha local: confirma identidade comparando
   *   dto.senha com a senha ja cadastrada (nao cria User novo, so o
   *   Membership nesta conta);
   * - email existente so-social (sem senha local): nao ha como confirmar
   *   identidade por senha aqui - pede pra definir uma via "esqueci minha
   *   senha" antes de tentar de novo.
   */
  async acceptInvite(token: string, dto: AcceptInviteDto, meta: SessionMeta) {
    const invite = await this.prisma.invite.findUnique({
      where: { token },
    });
    if (!invite || invite.status !== InviteStatus.pendente) {
      throw new NotFoundException('Convite invalido ou ja utilizado');
    }
    if (invite.expiresEm < new Date()) {
      throw new GoneException('Convite expirado');
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: invite.email },
    });

    const user = existingUser
      ? await this.acceptInviteForExistingUser(invite, existingUser, dto)
      : await this.acceptInviteForNewUser(invite, dto);

    const [session, account, ownerBranding] = await Promise.all([
      this.sessions.createSession(user.id, meta),
      this.prisma.account.findUniqueOrThrow({
        where: { id: invite.accountId },
        select: { nomeAgencia: true },
      }),
      resolveOwnerBranding(this.prisma, invite.accountId),
    ]);

    return {
      user: toMemberDto({
        id: user.id,
        nome: user.nome,
        email: user.email,
        avatarUrl: user.avatarUrl,
        role: UserRole.editor,
        status: UserStatus.ativo,
        accountId: invite.accountId,
        // Branding (white label) da agencia que o convite pertence - mesmo
        // padrao de AuthService.issueSessionAndToken, pra manter o shape do
        // `user` identico ao de login/register/select-account.
        logoUrl: ownerBranding.logoUrl,
        corDestaque: ownerBranding.corDestaque,
        nomeAgencia: account.nomeAgencia,
        branding: {
          logoUrl: ownerBranding.logoUrl,
          corDestaque: ownerBranding.corDestaque,
          nomeAgencia: account.nomeAgencia,
        },
        criadoEm: user.criadoEm,
      }),
      access_token: this.jwt.sign({
        sub: user.id,
        email: user.email,
        role: UserRole.editor,
        accountId: invite.accountId,
        sid: session.id,
      }),
    };
  }

  private async acceptInviteForNewUser(
    invite: { id: string; accountId: string; email: string },
    dto: AcceptInviteDto,
  ) {
    if (!dto.nome?.trim()) {
      throw new BadRequestException('Nome e obrigatorio');
    }

    const senhaHash = await bcrypt.hash(dto.senha, this.SALT_ROUNDS);

    const [user] = await this.prisma.$transaction([
      this.prisma.user.create({
        data: {
          nome: dto.nome,
          email: invite.email,
          senha: senhaHash,
          memberships: {
            create: {
              accountId: invite.accountId,
              role: UserRole.editor,
              status: UserStatus.ativo,
            },
          },
        },
        select: {
          id: true,
          nome: true,
          email: true,
          avatarUrl: true,
          criadoEm: true,
        },
      }),
      this.prisma.invite.update({
        where: { id: invite.id },
        data: { status: InviteStatus.aceito },
      }),
    ]);

    return user;
  }

  private async acceptInviteForExistingUser(
    invite: { id: string; accountId: string; email: string },
    existingUser: {
      id: string;
      nome: string;
      email: string;
      senha: string | null;
      avatarUrl: string | null;
      status: UserStatus;
      criadoEm: Date;
    },
    dto: AcceptInviteDto,
  ) {
    if (existingUser.status === UserStatus.suspenso) {
      throw new ForbiddenException(
        'Conta suspensa. Entre em contato com o administrador.',
      );
    }
    if (!existingUser.senha) {
      throw new BadRequestException(
        'Esta conta usa login social. Defina uma senha em "Esqueci minha senha" antes de aceitar este convite.',
      );
    }
    if (!(await bcrypt.compare(dto.senha, existingUser.senha))) {
      throw new UnauthorizedException('Senha invalida');
    }

    const existingMembership = await this.prisma.membership.findUnique({
      where: {
        userId_accountId: { userId: existingUser.id, accountId: invite.accountId },
      },
      select: { id: true, status: true },
    });
    if (existingMembership?.status === UserStatus.ativo) {
      throw new ConflictException('Voce ja e membro desta conta');
    }

    await this.prisma.$transaction([
      existingMembership
        ? this.prisma.membership.update({
            where: { id: existingMembership.id },
            data: { role: UserRole.editor, status: UserStatus.ativo },
          })
        : this.prisma.membership.create({
            data: {
              userId: existingUser.id,
              accountId: invite.accountId,
              role: UserRole.editor,
              status: UserStatus.ativo,
            },
          }),
      this.prisma.invite.update({
        where: { id: invite.id },
        data: { status: InviteStatus.aceito },
      }),
    ]);

    return existingUser;
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
   * Reenviar sempre renova a expiracao por mais 3 dias — se o convite
   * anterior ja tinha expirado, o novo link volta a ser valido.
   */
  async sendInviteEmail(accountId: string, inviteId: string) {
    const invite = await this.prisma.invite.findFirst({
      where: { id: inviteId, accountId },
      select: {
        id: true,
        email: true,
        status: true,
        token: true,
        criadoEm: true,
      },
    });
    if (!invite) {
      throw new NotFoundException('Convite nao encontrado nesta conta');
    }
    if (invite.status !== InviteStatus.pendente) {
      throw new ConflictException(
        'Convite ja foi aceito ou cancelado, nao e possivel reenviar',
      );
    }

    const expiresEm = new Date(Date.now() + this.INVITE_TTL_MS);
    await this.prisma.invite.update({
      where: { id: invite.id },
      data: { expiresEm },
    });

    const inviteUrl = this.buildInviteUrl(invite.token);
    await this.mail.send(
      invite.email,
      'Convite para colaborar na Vistoow',
      `Voce foi convidado(a) para colaborar como editor na APROVA. Acesse o link abaixo para criar sua senha:\n${inviteUrl}`,
    );

    // Devolve a linha inteira do convite (mesmo shape de listMembers) e nao
    // so o `sent`: o front atualiza a linha da tabela com esta resposta, sem
    // refetch, e precisa dos campos todos para nao perder dados no caminho.
    return {
      sent: true,
      ...toInvitedMemberDto({ ...invite, expiresEm }),
    };
  }

  /**
   * Lista os membros (owner + editores) da conta, junto com os convites
   * ainda pendentes (aceito/cancelado nao aparecem aqui). Convites entram
   * com `teamRole: editor` e `status: "invited"` — o front decide se exibe
   * como "pendente" ou "expirado" comparando `expiresAt` com a hora atual.
   */
  async listMembers(accountId: string) {
    const [memberships, invites] = await Promise.all([
      this.prisma.membership.findMany({
        where: { accountId },
        orderBy: [{ role: 'asc' }, { criadoEm: 'asc' }],
        select: {
          role: true,
          status: true,
          // "membro desde" = quando entrou nesta agencia, nao quando se
          // cadastrou na plataforma (a mesma pessoa pode ter entrado em
          // agencias diferentes em datas diferentes).
          criadoEm: true,
          user: {
            select: { id: true, nome: true, email: true, avatarUrl: true },
          },
        },
      }),
      this.prisma.invite.findMany({
        where: { accountId, status: InviteStatus.pendente },
        orderBy: { criadoEm: 'asc' },
        select: { id: true, email: true, criadoEm: true, expiresEm: true },
      }),
    ]);

    const members = memberships.map((m) =>
      toMemberDto({
        id: m.user.id,
        nome: m.user.nome,
        email: m.user.email,
        avatarUrl: m.user.avatarUrl,
        role: m.role,
        status: m.status,
        criadoEm: m.criadoEm,
      }),
    );

    const invitedMembers = invites.map((invite) => toInvitedMemberDto(invite));

    return [...members, ...invitedMembers];
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
    const membership = await this.prisma.membership.findUnique({
      where: { userId_accountId: { userId: memberId, accountId } },
      select: {
        id: true,
        role: true,
        status: true,
        user: {
          select: { id: true, nome: true, email: true, avatarUrl: true },
        },
      },
    });
    if (!membership) {
      throw new NotFoundException('Membro nao encontrado nesta conta');
    }

    if (
      membership.role === UserRole.owner &&
      status === UserStatus.suspenso &&
      membership.status !== UserStatus.suspenso
    ) {
      const outrosOwnersAtivos = await this.prisma.membership.count({
        where: {
          accountId,
          role: UserRole.owner,
          status: UserStatus.ativo,
          userId: { not: memberId },
        },
      });
      if (outrosOwnersAtivos === 0) {
        throw new BadRequestException(
          'Nao e possivel suspender o unico owner ativo da conta',
        );
      }
    }

    const updated = await this.prisma.membership.update({
      where: { id: membership.id },
      data: { status },
      select: { role: true, status: true },
    });
    return toMemberDto({ ...membership.user, ...updated });
  }

  /**
   * Owner promove um editor ativo a owner. Nao suporta rebaixar (owner ->
   * editor) - a conta pode ter mais de um owner simultaneamente.
   */
  async promoteMemberToOwner(accountId: string, memberId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_accountId: { userId: memberId, accountId } },
      select: {
        id: true,
        role: true,
        status: true,
        user: {
          select: { id: true, nome: true, email: true, avatarUrl: true },
        },
      },
    });
    if (!membership) {
      throw new NotFoundException('Membro nao encontrado nesta conta');
    }
    if (membership.role !== UserRole.editor) {
      throw new BadRequestException('Membro ja e owner');
    }
    if (membership.status !== UserStatus.ativo) {
      throw new BadRequestException(
        'Apenas editores ativos podem ser promovidos a owner',
      );
    }

    const updated = await this.prisma.membership.update({
      where: { id: membership.id },
      data: { role: UserRole.owner },
      select: { role: true, status: true },
    });
    return toMemberDto({ ...membership.user, ...updated });
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
    const membership = await this.prisma.membership.findUnique({
      where: { userId_accountId: { userId: memberId, accountId } },
      select: { id: true },
    });
    if (!membership) {
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

/**
 * Shape de um convite pendente na listagem de membros. `fotoUrl` vem sempre
 * null: o convidado ainda nao tem conta (logo, nao tem avatar) - mas o campo
 * precisa existir para o front nao apagar a foto ao reaproveitar a resposta
 * destas rotas para atualizar a linha da tabela.
 */
function toInvitedMemberDto(invite: {
  id: string;
  email: string;
  criadoEm: Date;
  expiresEm: Date;
}) {
  return {
    id: invite.id,
    nome: null,
    email: invite.email,
    fotoUrl: null,
    teamRole: UserRole.editor,
    status: 'invited' as const,
    criadoEm: invite.criadoEm,
    expiresAt: invite.expiresEm,
  };
}

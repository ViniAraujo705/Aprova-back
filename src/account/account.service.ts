import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  InviteStatus,
  UserRole,
  UserStatus,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInviteDto } from './dto/create-invite.dto';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { toMemberDto } from '../common/dto/team-role.util';

@Injectable()
export class AccountService {
  private readonly SALT_ROUNDS = 10;
  private readonly logger = new Logger(AccountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
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
  async acceptInvite(token: string, dto: AcceptInviteDto) {
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

    return {
      user: toMemberDto(user),
      access_token: this.jwt.sign({
        sub: user.id,
        email: user.email,
        role: user.role,
        accountId: user.accountId,
      }),
    };
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
   * Owner remove/suspende (ou reativa) um editor da propria conta. Nao
   * pode alterar o status de um owner (inclusive o proprio).
   */
  async setMemberStatus(
    accountId: string,
    memberId: string,
    status: UserStatus,
  ) {
    const member = await this.prisma.user.findFirst({
      where: { id: memberId, accountId },
      select: { id: true, role: true },
    });
    if (!member) {
      throw new NotFoundException('Membro nao encontrado nesta conta');
    }
    if (member.role !== UserRole.editor) {
      throw new BadRequestException(
        'Apenas editores podem ter o status alterado',
      );
    }

    const updated = await this.prisma.user.update({
      where: { id: member.id },
      data: { status },
      select: { id: true, nome: true, email: true, role: true, status: true },
    });
    return toMemberDto(updated);
  }

  private buildInviteUrl(token: string): string {
    const base = (this.config.get<string>('CORS_ORIGIN') ?? '')
      .split(',')[0]
      .trim();
    const origin = base && base !== '*' ? base : 'http://localhost:5173';
    return `${origin}/convite/${token}`;
  }
}

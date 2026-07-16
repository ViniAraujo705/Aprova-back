import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { OnboardingService } from './onboarding.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { toMemberDto } from '../common/dto/team-role.util';

@Injectable()
export class AuthService {
  private readonly SALT_ROUNDS = 10;
  private readonly RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hora
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly onboarding: OnboardingService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Ja existe uma conta com este email');
    }

    const senhaHash = await bcrypt.hash(dto.senha, this.SALT_ROUNDS);

    // Cadastro cria a agencia (Account) + o usuario dono (owner) juntos.
    // Cada agencia comeca com um unico owner; editores entram via convite.
    // A conta ja nasce com as 3 perguntas de avaliacao padrao (equivalentes
    // as antigas categorias fixas) - o owner pode editar/desativar/excluir
    // depois via /rating-questions.
    const user = await this.prisma.user.create({
      data: {
        nome: dto.nome,
        email: dto.email,
        senha: senhaHash,
        role: UserRole.owner,
        account: {
          create: {
            nomeAgencia: dto.nomeAgencia ?? dto.nome,
            ratingQuestions: {
              create: [
                { texto: 'Iluminação', ordem: 0 },
                { texto: 'Áudio', ordem: 1 },
                { texto: 'Enquadramento', ordem: 2 },
              ],
            },
          },
        },
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
    });

    // Popula dados de exemplo em background (não bloqueia o cadastro).
    // OnboardingService.seedExampleData nunca lança — trata o próprio erro.
    void this.onboarding.seedExampleData(user.accountId);

    return {
      user: toMemberDto(user),
      access_token: this.signToken(
        user.id,
        user.email,
        user.role,
        user.accountId,
      ),
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || !(await bcrypt.compare(dto.senha, user.senha))) {
      throw new UnauthorizedException('Credenciais invalidas');
    }

    if (user.status === 'suspenso') {
      throw new ForbiddenException(
        'Conta suspensa. Entre em contato com o administrador.',
      );
    }

    return {
      user: toMemberDto({
        id: user.id,
        nome: user.nome,
        email: user.email,
        role: user.role,
        status: user.status,
        accountId: user.accountId,
        criadoEm: user.criadoEm,
      }),
      access_token: this.signToken(
        user.id,
        user.email,
        user.role,
        user.accountId,
      ),
    };
  }

  /**
   * Gera um token de reset (valido por 1h) e envia por email. Sempre
   * retorna a mesma resposta, exista ou nao o email na base - evita que o
   * endpoint seja usado pra descobrir quais emails tem conta cadastrada.
   */
  async forgotPassword(dto: ForgotPasswordDto): Promise<{ sent: true }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true, email: true },
    });

    if (user) {
      const resetToken = await this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          expiresEm: new Date(Date.now() + this.RESET_TOKEN_TTL_MS),
        },
        select: { token: true },
      });

      const resetUrl = this.buildResetUrl(resetToken.token);
      try {
        await this.mail.send(
          user.email,
          'Redefinicao de senha - Vistoow',
          `Recebemos um pedido para redefinir sua senha. Acesse o link abaixo (valido por 1 hora):\n${resetUrl}\n\nSe voce nao pediu isso, ignore este email.`,
        );
      } catch (err) {
        // Nao propaga: a resposta ao cliente ja e generica e nao deve
        // revelar se o envio falhou (ex.: dominio de email invalido).
        this.logger.warn(
          `Falha ao enviar email de reset para ${user.email}: ${(err as Error).message}`,
        );
      }
    }

    return { sent: true };
  }

  /**
   * Consome um token de reset valido (nao usado, nao expirado) e troca a
   * senha do usuario. Invalida os demais tokens pendentes do usuario.
   */
  async resetPassword(dto: ResetPasswordDto): Promise<{ reset: true }> {
    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { token: dto.token },
      select: { id: true, userId: true, expiresEm: true, usedEm: true },
    });

    if (!resetToken || resetToken.usedEm || resetToken.expiresEm < new Date()) {
      throw new NotFoundException('Token invalido ou expirado');
    }

    const senhaHash = await bcrypt.hash(dto.novaSenha, this.SALT_ROUNDS);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: resetToken.userId },
        data: { senha: senhaHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedEm: new Date() },
      }),
      // Invalida quaisquer outros tokens pendentes do mesmo usuario.
      this.prisma.passwordResetToken.updateMany({
        where: {
          userId: resetToken.userId,
          usedEm: null,
          id: { not: resetToken.id },
        },
        data: { usedEm: new Date() },
      }),
    ]);

    return { reset: true };
  }

  private buildResetUrl(token: string): string {
    const base = (this.config.get<string>('CORS_ORIGIN') ?? '')
      .split(',')[0]
      .trim();
    const origin = base && base !== '*' ? base : 'http://localhost:5173';
    return `${origin}/redefinir-senha/${token}`;
  }

  private signToken(
    sub: string,
    email: string,
    role: UserRole,
    accountId: string,
  ): string {
    return this.jwt.sign({ sub, email, role, accountId });
  }
}

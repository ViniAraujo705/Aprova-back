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
import { User, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { OAuth2Client, TokenPayload } from 'google-auth-library';
import appleSignin, { AppleIdTokenType } from 'apple-signin-auth';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { OnboardingService } from './onboarding.service';
import { SessionMeta, SessionsService } from '../sessions/sessions.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ConfirmEmailDto } from './dto/confirm-email.dto';
import { ResendConfirmationDto } from './dto/resend-confirmation.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { AppleLoginDto } from './dto/apple-login.dto';
import { toMemberDto } from '../common/dto/team-role.util';

@Injectable()
export class AuthService {
  private readonly SALT_ROUNDS = 10;
  private readonly RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hora
  private readonly VERIFICATION_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias
  private readonly logger = new Logger(AuthService.name);
  private readonly googleClient = new OAuth2Client();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly onboarding: OnboardingService,
    private readonly sessions: SessionsService,
  ) {}

  async register(dto: RegisterDto, meta: SessionMeta) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Ja existe uma conta com este email');
    }

    const senhaHash = await bcrypt.hash(dto.senha, this.SALT_ROUNDS);
    const user = await this.createOwnerAccount({
      nome: dto.nome,
      email: dto.email,
      senhaHash,
      nomeAgencia: dto.nomeAgencia,
    });

    return this.buildAuthResponse(user, meta);
  }

  async login(dto: LoginDto, meta: SessionMeta) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user?.senha || !(await bcrypt.compare(dto.senha, user.senha))) {
      throw new UnauthorizedException('Credenciais invalidas');
    }

    if (user.status === 'suspenso') {
      throw new ForbiddenException(
        'Conta suspensa. Entre em contato com o administrador.',
      );
    }

    return this.buildAuthResponse(user, meta);
  }

  /**
   * Login/cadastro via Google. O client (app/frontend) faz o sign-in
   * nativo com o Google Sign-In SDK e envia aqui o ID token retornado -
   * o backend nunca ve a senha nem lida com o fluxo OAuth em si, so
   * valida o token com o google-auth-library.
   */
  async loginWithGoogle(dto: GoogleLoginDto, meta: SessionMeta) {
    const clientIds = this.getEnvList('GOOGLE_CLIENT_ID');
    if (clientIds.length === 0) {
      throw new ForbiddenException('Login com Google nao esta configurado');
    }

    let payload: TokenPayload | undefined;
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken: dto.idToken,
        audience: clientIds,
      });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('Token do Google invalido');
    }

    if (!payload?.sub || !payload.email) {
      throw new UnauthorizedException('Token do Google invalido');
    }
    if (!payload.email_verified) {
      throw new UnauthorizedException('Email do Google nao verificado');
    }

    const user = await this.findOrCreateSocialUser({
      provider: 'google',
      providerId: payload.sub,
      email: payload.email,
      nome: payload.name ?? payload.email.split('@')[0],
      avatarUrl: payload.picture,
      nomeAgencia: dto.nomeAgencia,
    });

    if (user.status === 'suspenso') {
      throw new ForbiddenException(
        'Conta suspensa. Entre em contato com o administrador.',
      );
    }

    return this.buildAuthResponse(user, meta);
  }

  /**
   * Login/cadastro via Apple. O client faz o Sign in with Apple e envia
   * aqui o identityToken (JWT assinado pela Apple) - validado via
   * apple-signin-auth (busca as chaves publicas da Apple e verifica
   * assinatura/issuer/audience/expiracao).
   *
   * A Apple so retorna o nome do usuario no client na primeira
   * autorizacao (nunca no token) - por isso `dto.nome` e opcional e deve
   * ser reenviado pelo frontend nesse primeiro momento.
   */
  async loginWithApple(dto: AppleLoginDto, meta: SessionMeta) {
    const clientIds = this.getEnvList('APPLE_CLIENT_ID');
    if (clientIds.length === 0) {
      throw new ForbiddenException('Login com Apple nao esta configurado');
    }

    let payload: AppleIdTokenType | undefined;
    try {
      payload = await appleSignin.verifyIdToken(dto.identityToken, {
        audience: clientIds,
        ignoreExpiration: false,
      });
    } catch {
      throw new UnauthorizedException('Token da Apple invalido');
    }

    if (!payload?.sub || !payload.email) {
      throw new UnauthorizedException('Token da Apple invalido');
    }
    if (
      payload.email_verified !== true &&
      (payload.email_verified as unknown) !== 'true'
    ) {
      throw new UnauthorizedException('Email da Apple nao verificado');
    }

    const user = await this.findOrCreateSocialUser({
      provider: 'apple',
      providerId: payload.sub,
      email: payload.email,
      nome: dto.nome ?? payload.email.split('@')[0],
      nomeAgencia: dto.nomeAgencia,
    });

    if (user.status === 'suspenso') {
      throw new ForbiddenException(
        'Conta suspensa. Entre em contato com o administrador.',
      );
    }

    return this.buildAuthResponse(user, meta);
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

  /**
   * Consome um token de confirmacao de email valido (nao usado, nao
   * expirado) e marca o usuario como verificado. Invalida os demais tokens
   * pendentes do usuario, mesmo padrao de resetPassword.
   */
  async confirmEmail(dto: ConfirmEmailDto): Promise<{ confirmed: true }> {
    const verification = await this.prisma.emailVerificationToken.findUnique({
      where: { token: dto.token },
      select: { id: true, userId: true, expiresEm: true, usedEm: true },
    });

    if (
      !verification ||
      verification.usedEm ||
      verification.expiresEm < new Date()
    ) {
      throw new NotFoundException('Token invalido ou expirado');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: verification.userId },
        data: { emailVerificadoEm: new Date() },
      }),
      this.prisma.emailVerificationToken.update({
        where: { id: verification.id },
        data: { usedEm: new Date() },
      }),
      // Invalida quaisquer outros tokens pendentes do mesmo usuario.
      this.prisma.emailVerificationToken.updateMany({
        where: {
          userId: verification.userId,
          usedEm: null,
          id: { not: verification.id },
        },
        data: { usedEm: new Date() },
      }),
    ]);

    return { confirmed: true };
  }

  /**
   * Reenvia o email de confirmacao caso o usuario ainda nao tenha
   * verificado. Resposta generica (mesmo padrao de forgotPassword) - nao
   * revela se o email existe ou ja esta verificado.
   */
  async resendConfirmation(
    dto: ResendConfirmationDto,
  ): Promise<{ sent: true }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true, nome: true, email: true, emailVerificadoEm: true },
    });

    if (user && !user.emailVerificadoEm) {
      try {
        await this.sendVerificationEmail(user);
      } catch (err) {
        // Nao propaga: a resposta ao cliente ja e generica e nao deve
        // revelar se o envio falhou (ex.: dominio de email invalido).
        this.logger.warn(
          `Falha ao reenviar email de confirmacao para ${user.email}: ${(err as Error).message}`,
        );
      }
    }

    return { sent: true };
  }

  /**
   * Encontra o usuario ja vinculado a esse provider social; se nao houver,
   * mas ja existir conta com o mesmo email (verificado pelo provider),
   * vincula o provider a essa conta; caso contrario cria uma conta nova
   * (Account + owner), igual ao fluxo de /auth/register.
   */
  private async findOrCreateSocialUser(params: {
    provider: 'google' | 'apple';
    providerId: string;
    email: string;
    nome: string;
    avatarUrl?: string;
    nomeAgencia?: string;
  }): Promise<User> {
    const isGoogle = params.provider === 'google';

    const existingByProvider = isGoogle
      ? await this.prisma.user.findUnique({
          where: { googleId: params.providerId },
        })
      : await this.prisma.user.findUnique({
          where: { appleId: params.providerId },
        });
    if (existingByProvider) {
      return existingByProvider;
    }

    const existingByEmail = await this.prisma.user.findUnique({
      where: { email: params.email },
    });
    if (existingByEmail) {
      return this.prisma.user.update({
        where: { id: existingByEmail.id },
        data: {
          googleId: isGoogle ? params.providerId : undefined,
          appleId: !isGoogle ? params.providerId : undefined,
          avatarUrl: existingByEmail.avatarUrl ?? params.avatarUrl,
          // O provider ja garantiu (email_verified) que esse email pertence
          // a quem esta logando - vale como confirmacao tambem se a conta
          // local ainda nao tinha confirmado.
          emailVerificadoEm: existingByEmail.emailVerificadoEm ?? new Date(),
        },
      });
    }

    return this.createOwnerAccount({
      nome: params.nome,
      email: params.email,
      nomeAgencia: params.nomeAgencia,
      googleId: isGoogle ? params.providerId : undefined,
      appleId: !isGoogle ? params.providerId : undefined,
      avatarUrl: params.avatarUrl,
    });
  }

  /**
   * Cria a agencia (Account) + o usuario dono (owner) juntos - usado tanto
   * pelo cadastro por email/senha quanto pelo primeiro login social. Cada
   * agencia comeca com um unico owner (editores entram via convite) e ja
   * nasce com as 3 perguntas de avaliacao padrao.
   */
  private async createOwnerAccount(params: {
    nome: string;
    email: string;
    senhaHash?: string;
    nomeAgencia?: string;
    googleId?: string;
    appleId?: string;
    avatarUrl?: string;
  }): Promise<User> {
    const user = await this.prisma.user.create({
      data: {
        nome: params.nome,
        email: params.email,
        senha: params.senhaHash,
        googleId: params.googleId,
        appleId: params.appleId,
        avatarUrl: params.avatarUrl,
        // Login social ja chega com o email verificado pelo provider
        // (checado em loginWithGoogle/loginWithApple antes de chegar aqui).
        emailVerificadoEm:
          params.googleId || params.appleId ? new Date() : undefined,
        role: UserRole.owner,
        account: {
          create: {
            nomeAgencia: params.nomeAgencia ?? params.nome,
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
    });

    // Popula dados de exemplo em background (não bloqueia o cadastro).
    // OnboardingService.seedExampleData nunca lança — trata o próprio erro.
    void this.onboarding.seedExampleData(user.accountId);

    // Email de boas-vindas em background (não bloqueia o cadastro).
    // sendWelcomeEmail nunca lança — trata o próprio erro, mesmo padrão acima.
    void this.sendWelcomeEmail(user);

    return user;
  }

  /**
   * Dispara o email de boas-vindas apos o cadastro. Login social (Google/
   * Apple) ja chega com o email verificado pelo provider - so recebe o
   * texto de boas-vindas. Cadastro por email/senha ganha tambem o link de
   * confirmacao (token valido por 7 dias). Nunca lanca - mesmo padrao de
   * OnboardingService.seedExampleData.
   */
  private async sendWelcomeEmail(user: User): Promise<void> {
    try {
      if (user.emailVerificadoEm) {
        await this.mail.send(
          user.email,
          'Bem-vindo(a) ao Vistoow!',
          `Ola, ${user.nome}!\n\nSua conta foi criada com sucesso. Bem-vindo(a) ao Vistoow.`,
        );
        return;
      }

      await this.sendVerificationEmail(user, { welcome: true });
    } catch (err) {
      this.logger.warn(
        `Falha ao enviar email de boas-vindas para ${user.email}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Gera um token de confirmacao de email (valido por 7 dias) e envia o
   * link por email. Usado tanto no primeiro email de boas-vindas quanto no
   * reenvio manual (resendConfirmation).
   */
  private async sendVerificationEmail(
    user: { id: string; nome: string; email: string },
    opts: { welcome?: boolean } = {},
  ): Promise<void> {
    const verification = await this.prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        expiresEm: new Date(Date.now() + this.VERIFICATION_TOKEN_TTL_MS),
      },
      select: { token: true },
    });

    const confirmUrl = this.buildConfirmUrl(verification.token);
    const intro = opts.welcome
      ? `Ola, ${user.nome}!\n\nSua conta foi criada com sucesso. Bem-vindo(a) ao Vistoow.`
      : `Ola, ${user.nome}!`;

    await this.mail.send(
      user.email,
      opts.welcome
        ? 'Bem-vindo(a) ao Vistoow!'
        : 'Confirme seu email - Vistoow',
      `${intro}\n\nConfirme seu email acessando o link abaixo (valido por 7 dias):\n${confirmUrl}`,
    );
  }

  /**
   * Monta a resposta padrao `{ user, access_token }`, nunca expondo
   * `senha`. Cria a sessao (linha em Session) antes de assinar o token,
   * pois o JWT carrega o id dela na claim `sid` (ver JwtStrategy).
   */
  private async buildAuthResponse(user: User, meta: SessionMeta) {
    const [session, account] = await Promise.all([
      this.sessions.createSession(user.id, meta),
      this.prisma.account.findUnique({
        where: { id: user.accountId },
        select: { nomeAgencia: true },
      }),
    ]);
    return {
      user: toMemberDto({
        id: user.id,
        nome: user.nome,
        email: user.email,
        role: user.role,
        status: user.status,
        accountId: user.accountId,
        // Branding (white label) da agencia: o painel/cliente precisa disso
        // logo apos o login, sem depender de uma segunda chamada.
        logoUrl: user.logoUrl,
        corDestaque: user.corDestaque,
        nomeAgencia: account?.nomeAgencia ?? null,
        criadoEm: user.criadoEm,
        emailVerificado: Boolean(user.emailVerificadoEm),
      }),
      access_token: this.signToken(
        user.id,
        user.email,
        user.role,
        user.accountId,
        session.id,
      ),
    };
  }

  /** Le uma env separada por virgula (ex: varios client IDs Google/Apple). */
  private getEnvList(key: string): string[] {
    return (this.config.get<string>(key) ?? '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  }

  private buildResetUrl(token: string): string {
    const base = (this.config.get<string>('CORS_ORIGIN') ?? '')
      .split(',')[0]
      .trim();
    const origin = base && base !== '*' ? base : 'http://localhost:5173';
    return `${origin}/redefinir-senha/${token}`;
  }

  private buildConfirmUrl(token: string): string {
    const base = (this.config.get<string>('CORS_ORIGIN') ?? '')
      .split(',')[0]
      .trim();
    const origin = base && base !== '*' ? base : 'http://localhost:5173';
    return `${origin}/confirmar-email/${token}`;
  }

  private signToken(
    sub: string,
    email: string,
    role: UserRole,
    accountId: string,
    sid: string,
  ): string {
    return this.jwt.sign({ sub, email, role, accountId, sid });
  }
}

import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SessionsService } from '../../sessions/sessions.service';

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  accountId: string;
  sid: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    const [user, membership, session] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, nome: true, email: true, status: true },
      }),
      // Papel/status vem do vinculo com a conta ativa do token (accountId),
      // nao mais direto do User - um usuario pode ter varias Memberships,
      // cada uma com seu proprio role/status (ver Membership no schema).
      this.prisma.membership.findUnique({
        where: {
          userId_accountId: {
            userId: payload.sub,
            accountId: payload.accountId,
          },
        },
        select: { role: true, status: true },
      }),
      this.prisma.session.findUnique({ where: { id: payload.sid } }),
    ]);

    if (!user) {
      throw new UnauthorizedException('Usuario nao encontrado');
    }

    // Banimento global de plataforma (ver AdminService.setUserStatus) -
    // distinto da suspensao dentro de uma conta especifica, checada abaixo.
    if (user.status === 'suspenso') {
      throw new ForbiddenException('Conta suspensa');
    }

    // Sessao revogada (apagada via "encerrar sessao") ou de outro usuario -
    // mesmo tratamento de um token expirado: 401.
    if (!session || session.userId !== user.id) {
      throw new UnauthorizedException('Sessao invalida ou expirada');
    }

    // Vinculo removido/suspenso pelo owner depois do token ter sido emitido
    // (ex.: no meio de uma sessao ativa) - mesmo efeito de uma sessao revogada.
    if (!membership || membership.status === 'suspenso') {
      throw new ForbiddenException('Acesso a esta conta foi revogado');
    }

    this.sessions.touchSession(session);

    // Fica disponivel em request.user
    return {
      id: user.id,
      nome: user.nome,
      email: user.email,
      role: membership.role,
      status: membership.status,
      accountId: payload.accountId,
      sessionId: session.id,
    };
  }
}

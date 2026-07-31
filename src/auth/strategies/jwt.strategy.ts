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
      secretOrKey: config.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    const [user, session] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          nome: true,
          email: true,
          role: true,
          status: true,
          accountId: true,
        },
      }),
      this.prisma.session.findUnique({ where: { id: payload.sid } }),
    ]);

    if (!user) {
      throw new UnauthorizedException('Usuario nao encontrado');
    }

    if (user.status === 'suspenso') {
      throw new ForbiddenException('Conta suspensa');
    }

    // Sessao revogada (apagada via "encerrar sessao") ou de outro usuario -
    // mesmo tratamento de um token expirado: 401.
    if (!session || session.userId !== user.id) {
      throw new UnauthorizedException('Sessao invalida ou expirada');
    }

    this.sessions.touchSession(session);

    // Fica disponivel em request.user
    return { ...user, sessionId: session.id };
  }
}

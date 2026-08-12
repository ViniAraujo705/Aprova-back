import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';

export interface SelectAccountRequestUser {
  sub: string;
  sessionId?: string;
}

interface SelectAccountPayload {
  sub?: string;
  sid?: string;
  purpose?: string;
}

/**
 * Guard proprio para POST /auth/select-account, que aceita dois tipos de
 * token (por isso nao reusa a JwtStrategy/JwtAuthGuard normal):
 * - o pendingToken de escopo restrito (`purpose: 'select-account'`, sem
 *   sid/accountId) emitido pelo login quando ha 2+ agencias vinculadas;
 * - um token completo normal, para quem ja esta logado e quer trocar de
 *   conta ativa - nesse caso reaproveita o `sid` (sessao existente) em vez
 *   de criar uma sessao nova.
 * Verifica a assinatura/expiracao manualmente via JwtService em vez de uma
 * segunda Passport Strategy, e nao valida membership da conta atual (isso
 * seria contraproducente aqui: o ponto do endpoint e justamente trocar de
 * conta).
 */
@Injectable()
export class SelectAccountGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException('Token nao informado');
    }

    let payload: SelectAccountPayload;
    try {
      payload = this.jwt.verify<SelectAccountPayload>(token);
    } catch {
      throw new UnauthorizedException('Token invalido ou expirado');
    }

    if (!payload.sub) {
      throw new UnauthorizedException('Token invalido');
    }
    // Token completo (login normal) nao tem `purpose` - so o pendingToken
    // tem, e so pode ser usado com esse valor exato.
    if (payload.purpose !== undefined && payload.purpose !== 'select-account') {
      throw new UnauthorizedException('Token invalido');
    }

    if (payload.sid) {
      const session = await this.prisma.session.findUnique({
        where: { id: payload.sid },
      });
      if (!session || session.userId !== payload.sub) {
        throw new UnauthorizedException('Sessao invalida ou expirada');
      }
    }

    (request as Request & { user: SelectAccountRequestUser }).user = {
      sub: payload.sub,
      sessionId: payload.sid,
    };
    return true;
  }

  private extractToken(request: Request): string | null {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) return null;
    return header.slice('Bearer '.length);
  }
}

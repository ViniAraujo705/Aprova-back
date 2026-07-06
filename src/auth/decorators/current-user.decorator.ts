import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';

export interface AuthUser {
  id: string;
  nome: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  accountId: string;
}

/**
 * Injeta o usuario autenticado (populado pela JwtStrategy) no handler.
 * Uso: metodo(@CurrentUser() user: AuthUser)
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);

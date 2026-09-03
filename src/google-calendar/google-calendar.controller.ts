import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import {
  ApiBearerAuth,
  ApiExcludeEndpoint,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  AuthUser,
  CurrentUser,
} from '../auth/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleCalendarOAuthService } from './google-calendar-oauth.service';
import { GoogleCalendarStatusDto } from './dto/google-calendar-status.dto';
import { resolveFrontendUrl } from '../common/frontend-url.util';

const STATE_PURPOSE = 'gcal-connect';

/**
 * Conexao pessoal do usuario com seu Google Calendar (OAuth auth-code,
 * escopo calendar.events) - fluxo distinto do login social (que usa
 * verificacao de ID token, ver AuthService.loginWithGoogle). O callback e a
 * unica rota publica: chega como redirect direto do navegador vindo do
 * Google, sem Authorization header - por isso o `state` carrega o userId
 * assinado (ver #connect).
 */
@ApiTags('google-calendar')
@Controller('integrations/google-calendar')
export class GoogleCalendarController {
  private readonly logger = new Logger(GoogleCalendarController.name);

  constructor(
    private readonly oauth: GoogleCalendarOAuthService,
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  @Get('connect')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.owner, UserRole.editor)
  @ApiOperation({
    summary:
      'Retorna a URL de consentimento do Google pra conectar o Google Calendar pessoal do usuario.',
  })
  connect(@CurrentUser() user: AuthUser): { url: string } {
    const state = this.jwt.sign(
      { sub: user.id, purpose: STATE_PURPOSE },
      { expiresIn: '10m' },
    );
    return { url: this.oauth.generateAuthUrl(state) };
  }

  @Get('callback')
  @ApiExcludeEndpoint()
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (error || !code || !state) {
      res.redirect(this.buildFrontendUrl('erro'));
      return;
    }
    try {
      const payload = this.jwt.verify<{ sub: string; purpose: string }>(state);
      if (payload.purpose !== STATE_PURPOSE) {
        throw new Error('state com purpose inesperado');
      }
      const { refreshToken, email } = await this.oauth.exchangeCode(code);
      const refreshTokenEnc = this.oauth.encryptRefreshToken(refreshToken);
      await this.prisma.googleCalendarConnection.upsert({
        where: { userId: payload.sub },
        create: { userId: payload.sub, googleEmail: email, refreshTokenEnc },
        update: { googleEmail: email, refreshTokenEnc },
      });
      res.redirect(this.buildFrontendUrl('conectado'));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'erro desconhecido';
      this.logger.warn(
        `Falha ao concluir conexao com Google Calendar: ${message}`,
      );
      res.redirect(this.buildFrontendUrl('erro'));
    }
  }

  @Get('status')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.owner, UserRole.editor)
  @ApiOperation({
    summary: 'Status da conexao do usuario com o Google Calendar.',
  })
  async status(
    @CurrentUser() user: AuthUser,
  ): Promise<GoogleCalendarStatusDto> {
    const connection = await this.prisma.googleCalendarConnection.findUnique({
      where: { userId: user.id },
      select: { googleEmail: true },
    });
    return {
      connected: !!connection,
      googleEmail: connection?.googleEmail ?? null,
    };
  }

  @Delete('disconnect')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.owner, UserRole.editor)
  @ApiOperation({
    summary:
      'Desconecta o Google Calendar do usuario. Nao apaga eventos ja criados no Google, so para o sync futuro.',
  })
  async disconnect(
    @CurrentUser() user: AuthUser,
  ): Promise<{ disconnected: true }> {
    const connection = await this.prisma.googleCalendarConnection.findUnique({
      where: { userId: user.id },
    });
    if (connection) {
      await this.oauth.revokeToken(connection.refreshTokenEnc);
      await this.prisma.googleCalendarConnection.delete({
        where: { userId: user.id },
      });
    }
    return { disconnected: true };
  }

  private buildFrontendUrl(status: 'conectado' | 'erro'): string {
    const origin = resolveFrontendUrl(this.config) ?? 'http://localhost:5173';
    return `${origin}/configuracoes/integracoes?google=${status}`;
  }
}

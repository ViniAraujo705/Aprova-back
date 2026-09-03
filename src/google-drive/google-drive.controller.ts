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
import { GoogleDriveOAuthService } from './google-drive-oauth.service';
import { GoogleDriveService } from './google-drive.service';
import { GoogleDriveStatusDto } from './dto/google-drive-status.dto';
import { ListGoogleDriveItemsQueryDto } from './dto/list-google-drive-items-query.dto';
import { resolveFrontendUrl } from '../common/frontend-url.util';

const STATE_PURPOSE = 'gdrive-connect';

@ApiTags('google-drive')
@Controller('integrations/google-drive')
export class GoogleDriveController {
  private readonly logger = new Logger(GoogleDriveController.name);

  constructor(
    private readonly oauth: GoogleDriveOAuthService,
    private readonly drive: GoogleDriveService,
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  @Get('connect')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.owner, UserRole.editor)
  @ApiOperation({
    summary: 'Retorna a URL para conectar o Google Drive pessoal do usuario.',
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
      if (payload.purpose !== STATE_PURPOSE)
        throw new Error('state com purpose inesperado');
      const { refreshToken, email } = await this.oauth.exchangeCode(code);
      await this.prisma.googleDriveConnection.upsert({
        where: { userId: payload.sub },
        create: {
          userId: payload.sub,
          googleEmail: email,
          refreshTokenEnc: this.oauth.encryptRefreshToken(refreshToken),
        },
        update: {
          googleEmail: email,
          refreshTokenEnc: this.oauth.encryptRefreshToken(refreshToken),
        },
      });
      res.redirect(this.buildFrontendUrl('conectado'));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'erro desconhecido';
      this.logger.warn(
        `Falha ao concluir conexao com Google Drive: ${message}`,
      );
      res.redirect(this.buildFrontendUrl('erro'));
    }
  }

  @Get('status')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.owner, UserRole.editor)
  async status(@CurrentUser() user: AuthUser): Promise<GoogleDriveStatusDto> {
    const connection = await this.prisma.googleDriveConnection.findUnique({
      where: { userId: user.id },
      select: { googleEmail: true },
    });
    return {
      connected: !!connection,
      googleEmail: connection?.googleEmail ?? null,
    };
  }

  @Get('items')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.owner, UserRole.editor)
  @ApiOperation({
    summary:
      'Navega por arquivos e pastas do Drive conectado, sem baixar conteudo.',
  })
  listItems(
    @CurrentUser() user: AuthUser,
    @Query() query: ListGoogleDriveItemsQueryDto,
  ) {
    return this.drive.listItems(user.id, query);
  }

  @Delete('disconnect')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.owner, UserRole.editor)
  async disconnect(
    @CurrentUser() user: AuthUser,
  ): Promise<{ disconnected: true }> {
    const connection = await this.prisma.googleDriveConnection.findUnique({
      where: { userId: user.id },
    });
    if (connection) {
      await this.oauth.revokeToken(connection.refreshTokenEnc);
      await this.prisma.googleDriveConnection.delete({
        where: { userId: user.id },
      });
    }
    return { disconnected: true };
  }

  private buildFrontendUrl(status: 'conectado' | 'erro'): string {
    const origin = resolveFrontendUrl(this.config) ?? 'http://localhost:5173';
    return `${origin}/configuracoes/integracoes?googleDrive=${status}`;
  }
}

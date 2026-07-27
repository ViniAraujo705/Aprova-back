import {
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  CurrentUser,
  AuthUser,
} from '../auth/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';

/**
 * Notificacoes in-app do owner/editor responsavel. Escopo sempre
 * userId + accountId do token - nunca cruza contas ou usuarios.
 */
@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.owner, UserRole.editor)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({
    summary:
      'Lista as notificações do usuário autenticado (mais recentes primeiro, máx. 50).',
  })
  @ApiQuery({ name: 'naoLidas', required: false, type: Boolean })
  list(
    @CurrentUser() user: AuthUser,
    @Query('naoLidas', new DefaultValuePipe(false), ParseBoolPipe)
    naoLidas: boolean,
  ) {
    return this.notificationsService.list(user, naoLidas || undefined);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Quantidade de notificações não lidas.' })
  unreadCount(@CurrentUser() user: AuthUser) {
    return this.notificationsService.unreadCount(user);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Marca uma notificação como lida.' })
  markRead(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.notificationsService.markRead(user, id);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Marca todas as notificações como lidas.' })
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.notificationsService.markAllRead(user);
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  CurrentUser,
  AuthUser,
} from '../auth/decorators/current-user.decorator';
import { AccountService } from './account.service';
import { CreateInviteDto } from './dto/create-invite.dto';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { UpdateMemberStatusDto } from './dto/update-member-status.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';

@ApiTags('account')
@Controller('account')
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @Post('invite')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.owner)
  @ApiOperation({
    summary:
      'Owner convida um editor por email: cria um convite pendente e envia (simulado) o link de aceite.',
  })
  invite(@CurrentUser() user: AuthUser, @Body() dto: CreateInviteDto) {
    return this.accountService.invite(user.accountId, dto);
  }

  @Post('invite/:token/accept')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Endpoint público: aceita o convite (nome + senha), cria o usuário editor e marca o convite como aceito.',
  })
  acceptInvite(
    @Param('token', new ParseUUIDPipe({ version: '4' })) token: string,
    @Body() dto: AcceptInviteDto,
  ) {
    return this.accountService.acceptInvite(token, dto);
  }

  @Delete('invite/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.owner)
  @ApiOperation({ summary: 'Owner cancela um convite pendente.' })
  cancelInvite(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.accountService.cancelInvite(user.accountId, id);
  }

  @Post('invite/:id/send-email')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.owner)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Owner dispara o envio real (via provedor transacional) do e-mail de convite pendente.',
  })
  sendInviteEmail(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.accountService.sendInviteEmail(user.accountId, id);
  }

  @Get('members')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.owner)
  @ApiOperation({
    summary: 'Owner lista os membros (owner + editores) da conta.',
  })
  listMembers(@CurrentUser() user: AuthUser) {
    return this.accountService.listMembers(user.accountId);
  }

  @Patch('members/:id/status')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.owner)
  @ApiOperation({
    summary: 'Owner remove/suspende ou reativa um editor da conta.',
  })
  setMemberStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateMemberStatusDto,
  ) {
    return this.accountService.setMemberStatus(user.accountId, id, dto.status);
  }

  @Patch('members/:id/role')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.owner)
  @ApiOperation({
    summary: 'Owner promove um editor ativo a owner (nao suporta rebaixar).',
  })
  promoteMember(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() _dto: UpdateMemberRoleDto,
  ) {
    return this.accountService.promoteMemberToOwner(user.accountId, id);
  }
}

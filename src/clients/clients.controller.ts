import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  CurrentUser,
  AuthUser,
} from '../auth/decorators/current-user.decorator';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { ClientPhotoUploadUrlDto } from './dto/client-photo-upload-url.dto';
import { ClientBrandingLogoUploadUrlDto } from './dto/client-branding-logo-upload-url.dto';
import { UpdateClientBrandingDto } from './dto/update-client-branding.dto';
import { ListClientActivityQueryDto } from './dto/list-client-activity-query.dto';

@ApiTags('clients')
@ApiBearerAuth()
@Controller('clients')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.owner, UserRole.editor)
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateClientDto) {
    return this.clientsService.create(user.accountId, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.clientsService.findAll(user.accountId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.clientsService.findOne(user.accountId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateClientDto,
  ) {
    return this.clientsService.update(user.accountId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.clientsService.remove(user.accountId, id);
  }

  @Post(':id/photo-upload-url')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Gera uma presigned URL para o upload da foto do cliente (R2). O frontend faz PUT direto na uploadUrl.',
  })
  createPhotoUploadUrl(@Body() dto: ClientPhotoUploadUrlDto) {
    return this.clientsService.createPhotoUploadUrl(dto);
  }

  @Post(':id/branding/logo-upload-url')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.owner)
  @ApiOperation({
    summary:
      'Gera uma presigned URL para o upload do logo proprio do cliente (R2). So owner - mesma regra do branding da agencia.',
  })
  createBrandingLogoUploadUrl(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ClientBrandingLogoUploadUrlDto,
  ) {
    return this.clientsService.createBrandingLogoUploadUrl(
      user.accountId,
      id,
      dto,
    );
  }

  @Get(':id/activity')
  @ApiOperation({
    summary:
      'Trilha de auditoria do cliente (append-only), paginada por cursor - mais recente primeiro.',
  })
  getActivity(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query() query: ListClientActivityQueryDto,
  ) {
    return this.clientsService.getActivity(
      user.accountId,
      id,
      query.cursor,
      query.limit,
    );
  }

  @Patch(':id/branding')
  @Roles(UserRole.owner)
  updateBranding(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateClientBrandingDto,
  ) {
    return this.clientsService.updateBranding(user.accountId, id, dto);
  }
}

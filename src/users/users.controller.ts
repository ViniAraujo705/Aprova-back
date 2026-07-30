import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
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
import { UsersService } from './users.service';
import { UpdateBrandingDto } from './dto/update-branding.dto';
import { LogoUploadUrlDto } from './dto/logo-upload-url.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { PhotoUploadUrlDto } from './dto/photo-upload-url.dto';

const ANY_ROLE = [UserRole.owner, UserRole.editor, UserRole.admin];

@ApiTags('users')
@ApiBearerAuth()
@Controller('users/me')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.owner)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Patch()
  @Roles(...ANY_ROLE)
  @ApiOperation({
    summary:
      'Atualiza os dados do proprio usuario logado (nome/email/foto). Envia so os campos que devem mudar.',
  })
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateMeDto) {
    return this.usersService.updateMe(user.id, dto);
  }

  @Post('photo-upload-url')
  @Roles(...ANY_ROLE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Gera uma presigned URL para o upload da foto de perfil do proprio usuario (R2). O frontend faz PUT direto na uploadUrl.',
  })
  createPhotoUploadUrl(@Body() dto: PhotoUploadUrlDto) {
    return this.usersService.createPhotoUploadUrl(dto);
  }

  @Post('branding/logo-upload-url')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Gera uma presigned URL para o upload do logo da agência (R2). O frontend faz PUT direto na uploadUrl.',
  })
  createLogoUploadUrl(@Body() dto: LogoUploadUrlDto) {
    return this.usersService.createLogoUploadUrl(dto);
  }

  @Patch('branding')
  @ApiOperation({
    summary:
      'Atualiza o branding (white label) da agência: logo_url e cor_destaque.',
  })
  updateBranding(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateBrandingDto,
  ) {
    return this.usersService.updateBranding(user.id, user.accountId, dto);
  }
}

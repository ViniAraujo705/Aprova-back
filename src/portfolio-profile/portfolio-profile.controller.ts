import {
  Body,
  Controller,
  Get,
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
import { PortfolioProfileService } from './portfolio-profile.service';
import { UpdatePortfolioProfileDto } from './dto/update-portfolio-profile.dto';
import { PortfolioProfilePhotoUploadUrlDto } from './dto/photo-upload-url.dto';

/**
 * Perfil publico unico da agencia (hub de portfolios organizados por
 * categoria) - ver PublicPortfolioHubController. Somente owner.
 */
@ApiTags('portfolio-profile')
@ApiBearerAuth()
@Controller('portfolio-profile')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.owner)
export class PortfolioProfileController {
  constructor(
    private readonly portfolioProfileService: PortfolioProfileService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'Perfil do hub publico (fotoUrl + linkHub). linkHub e gerado automaticamente na primeira leitura.',
  })
  get(@CurrentUser() user: AuthUser) {
    return this.portfolioProfileService.getOrCreate(user.accountId);
  }

  @Patch()
  update(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdatePortfolioProfileDto,
  ) {
    return this.portfolioProfileService.update(user.accountId, dto);
  }

  @Post('photo-upload-url')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Presigned URL so de imagem pra foto de perfil do hub (sem passo de confirmacao - a publicUrl vai direto num PATCH /portfolio-profile { fotoUrl }).',
  })
  createPhotoUploadUrl(@Body() dto: PortfolioProfilePhotoUploadUrlDto) {
    return this.portfolioProfileService.createPhotoUploadUrl(dto);
  }
}

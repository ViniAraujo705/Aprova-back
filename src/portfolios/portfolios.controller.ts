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
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  CurrentUser,
  AuthUser,
} from '../auth/decorators/current-user.decorator';
import { UploadUrlDto } from '../videos/dto/upload-url.dto';
import { PortfoliosService } from './portfolios.service';
import { CreatePortfolioDto } from './dto/create-portfolio.dto';
import { UpdatePortfolioDto } from './dto/update-portfolio.dto';
import { AddExistingVideoDto } from './dto/add-existing-video.dto';
import { PortfolioUploadCompleteDto } from './dto/upload-complete.dto';
import { UpdatePortfolioVideoDto } from './dto/update-portfolio-video.dto';
import { ReorderPortfolioVideosDto } from './dto/reorder-portfolio-videos.dto';

/**
 * Vitrine da agencia (distinta da galeria de projeto): colecao curada
 * manualmente pelo owner, sem status de aprovacao. Somente owner - mesma
 * regra de branding/equipe/planos.
 */
@ApiTags('portfolios')
@ApiBearerAuth()
@Controller('portfolios')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.owner)
export class PortfoliosController {
  constructor(private readonly portfoliosService: PortfoliosService) {}

  @Get()
  @ApiOperation({
    summary: 'Lista os portfolios da conta (resumo, sem videos[]).',
  })
  list(@CurrentUser() user: AuthUser) {
    return this.portfoliosService.list(user.accountId);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.portfoliosService.findOne(user.accountId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePortfolioDto) {
    return this.portfoliosService.create(user.accountId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdatePortfolioDto,
  ) {
    return this.portfoliosService.update(user.accountId, id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.portfoliosService.remove(user.accountId, id);
  }

  @Post(':id/videos')
  @ApiOperation({
    summary:
      'Adiciona ao portfolio um video ja existente em algum projeto da conta (copia urlStorage/posterUrl no momento).',
  })
  addExistingVideo(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: AddExistingVideoDto,
  ) {
    return this.portfoliosService.addExistingVideo(user.accountId, id, dto);
  }

  @Post(':id/upload-url')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Presigned URL pro upload dedicado direto no portfolio (mesmo contrato de POST /videos/upload-url).',
  })
  createUploadUrl(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UploadUrlDto,
  ) {
    return this.portfoliosService.createUploadUrl(user.accountId, id, dto);
  }

  @Post(':id/videos/upload-complete')
  @ApiOperation({
    summary:
      'Registra, direto no portfolio, um video enviado pelo passo de upload-url - sem projeto/cliente por tras.',
  })
  uploadComplete(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: PortfolioUploadCompleteDto,
  ) {
    return this.portfoliosService.uploadComplete(user.accountId, id, dto);
  }

  @Patch(':id/videos/order')
  @ApiOperation({
    summary:
      'Reordena os videos do portfolio a partir do array completo de ids na ordem desejada.',
  })
  reorder(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: ReorderPortfolioVideosDto,
  ) {
    return this.portfoliosService.reorder(user.accountId, id, dto);
  }

  @Patch(':id/videos/:videoId')
  updateVideo(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('videoId', new ParseUUIDPipe({ version: '4' })) videoId: string,
    @Body() dto: UpdatePortfolioVideoDto,
  ) {
    return this.portfoliosService.updateVideo(user.accountId, id, videoId, dto);
  }

  @Delete(':id/videos/:videoId')
  removeVideo(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('videoId', new ParseUUIDPipe({ version: '4' })) videoId: string,
  ) {
    return this.portfoliosService.removeVideo(user.accountId, id, videoId);
  }
}

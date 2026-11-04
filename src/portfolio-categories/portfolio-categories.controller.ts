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
import { PortfolioCategoriesService } from './portfolio-categories.service';
import { CreatePortfolioCategoryDto } from './dto/create-portfolio-category.dto';
import { UpdatePortfolioCategoryDto } from './dto/update-portfolio-category.dto';
import { PortfolioCategoryCoverUploadUrlDto } from './dto/cover-upload-url.dto';

/**
 * Categorias livres criadas pelo owner para organizar os albuns de
 * portfolio no hub publico (ver PublicPortfolioHubController). Sem valores
 * fixos - o owner nomeia como quiser.
 */
@ApiTags('portfolio-categories')
@ApiBearerAuth()
@Controller('portfolio-categories')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.owner)
export class PortfolioCategoriesController {
  constructor(
    private readonly portfolioCategoriesService: PortfolioCategoriesService,
  ) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.portfolioCategoriesService.findAll(user.accountId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreatePortfolioCategoryDto,
  ) {
    return this.portfolioCategoriesService.create(user.accountId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdatePortfolioCategoryDto,
  ) {
    return this.portfolioCategoriesService.update(user.accountId, id, dto);
  }

  @Post(':id/cover-upload-url')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Presigned URL so de imagem pra capa da aba (sem passo de confirmacao - a publicUrl vai direto num PATCH /portfolio-categories/:id { capaUrl }).',
  })
  createCoverUploadUrl(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: PortfolioCategoryCoverUploadUrlDto,
  ) {
    return this.portfolioCategoriesService.createCoverUploadUrl(
      user.accountId,
      id,
      dto,
    );
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.portfolioCategoriesService.remove(user.accountId, id);
  }
}

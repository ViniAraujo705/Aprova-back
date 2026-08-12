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
import { VideosService } from './videos.service';
import { UploadUrlDto } from './dto/upload-url.dto';
import { CreateVideoDto } from './dto/create-video.dto';
import { NewVersionDto } from './dto/new-version.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { UpdateEtapaDto } from './dto/update-etapa.dto';
import { UpdateDeadlineDto } from './dto/update-deadline.dto';
import { UpdateTituloDto } from './dto/update-titulo.dto';
import { UpdateEditorResponsavelDto } from './dto/update-editor-responsavel.dto';
import { ListVideosQueryDto } from './dto/list-videos-query.dto';

@ApiTags('videos')
@ApiBearerAuth()
@Controller('videos')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.owner, UserRole.editor)
export class VideosController {
  constructor(private readonly videosService: VideosService) {}

  @Post('upload-url')
  @HttpCode(HttpStatus.OK)
  createUploadUrl(@Body() dto: UploadUrlDto) {
    return this.videosService.createUploadUrl(dto);
  }

  @Post()
  @ApiOperation({
    summary:
      'Registra o vídeo e dispara em background a geração de thumbnail + versão otimizada (status_processamento inicia em "processando").',
  })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateVideoDto) {
    return this.videosService.create(user.accountId, dto, user);
  }

  @Post(':id/new-version')
  createNewVersion(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: NewVersionDto,
  ) {
    return this.videosService.createNewVersion(user.accountId, id, dto, user);
  }

  @Get()
  @ApiOperation({
    summary:
      'Lista videos, paginado (default page=1, limit=50, teto 100). Com project_id, filtra por projeto; sem project_id, retorna os videos de todos os projetos da conta.',
  })
  findByProject(
    @CurrentUser() user: AuthUser,
    @Query() query: ListVideosQueryDto,
  ) {
    return this.videosService.findByProject(
      user.accountId,
      query.project_id,
      query.page,
      query.limit,
      user,
    );
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.videosService.updateStatus(
      user.accountId,
      id,
      dto.status,
      user,
    );
  }

  @Patch(':id/etapa')
  @ApiOperation({
    summary:
      'Atualiza a etapa de producao interna (board Kanban) - independente do status de aprovacao do cliente.',
  })
  updateEtapa(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateEtapaDto,
  ) {
    return this.videosService.updateEtapa(user.accountId, id, dto.etapa, user);
  }

  @Patch(':id/deadline')
  @Roles(UserRole.owner)
  @ApiOperation({
    summary:
      'Owner define ou remove o prazo de entrega do vídeo. Nunca exposto no canal público do cliente.',
  })
  updateDeadline(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateDeadlineDto,
  ) {
    return this.videosService.updateDeadline(user.accountId, id, dto, user);
  }

  @Patch(':id/titulo')
  updateTitulo(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateTituloDto,
  ) {
    return this.videosService.updateTitulo(user.accountId, id, dto, user);
  }

  @Patch(':id/editor-responsavel')
  @Roles(UserRole.owner)
  @ApiOperation({
    summary:
      'Owner define ou remove o editor (ou owner) responsavel pelo video. Usado no desempenho da equipe.',
  })
  updateEditorResponsavel(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateEditorResponsavelDto,
  ) {
    return this.videosService.updateEditorResponsavel(
      user.accountId,
      id,
      dto.editorId,
      user,
    );
  }

  @Delete(':id')
  @Roles(UserRole.owner)
  @ApiOperation({
    summary:
      'Owner exclui o video (comentarios e ratings sao removidos em cascata). Bloqueado com 409 se houver versoes filhas vinculadas.',
  })
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.videosService.remove(user.accountId, id);
  }
}

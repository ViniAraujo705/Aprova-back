import {
  Body,
  Controller,
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
import { UpdateDeadlineDto } from './dto/update-deadline.dto';

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
    return this.videosService.create(user.accountId, dto);
  }

  @Post(':id/new-version')
  createNewVersion(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: NewVersionDto,
  ) {
    return this.videosService.createNewVersion(user.accountId, id, dto);
  }

  @Get()
  findByProject(
    @CurrentUser() user: AuthUser,
    @Query('project_id', new ParseUUIDPipe({ version: '4' }))
    projectId: string,
  ) {
    return this.videosService.findByProject(user.accountId, projectId);
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.videosService.updateStatus(user.accountId, id, dto.status);
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
    return this.videosService.updateDeadline(user.accountId, id, dto);
  }
}

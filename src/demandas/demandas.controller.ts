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
import { DemandasService } from './demandas.service';
import { CreateDemandaDto } from './dto/create-demanda.dto';
import { UpdateDemandaDto } from './dto/update-demanda.dto';
import { UpdateDemandaEtapaDto } from './dto/update-demanda-etapa.dto';
import { ListDemandasQueryDto } from './dto/list-demandas-query.dto';
import {
  CreateChecklistItemDto,
  UpdateChecklistItemDto,
} from './dto/checklist-item.dto';
import {
  CreateComentarioDto,
  UpdateComentarioDto,
} from './dto/comentario.dto';
import { UpdateDemandaColunaDto } from './dto/update-demanda-coluna.dto';
import {
  AnexoUploadUrlDto,
  RegisterAnexoDto,
  SetCapaDto,
} from './dto/anexo.dto';
import { CopiarDemandaDto, MoverDemandaDto } from './dto/mover-demanda.dto';

const UUID = new ParseUUIDPipe({ version: '4' });

@ApiTags('demandas')
@ApiBearerAuth()
@Controller('demandas')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.owner, UserRole.editor)
export class DemandasController {
  constructor(private readonly demandasService: DemandasService) {}

  @Post()
  @ApiOperation({
    summary:
      'Cria um card generico do board Kanban (projeto/campanha/gravacao/demanda), sem vinculo com Video.',
  })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDemandaDto) {
    return this.demandasService.create(user.accountId, dto, user.id);
  }

  @Get()
  @ApiOperation({
    summary:
      'Lista as demandas do quadro (ordenadas por posicao). ?arquivadas=true lista so as arquivadas.',
  })
  findAll(@CurrentUser() user: AuthUser, @Query() query: ListDemandasQueryDto) {
    return this.demandasService.findAll(
      user.accountId,
      query.arquivadas ?? false,
      query.quadroId,
    );
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Edita titulo/tipo/cliente/responsavel/prazo de uma demanda.',
  })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateDemandaDto,
  ) {
    return this.demandasService.update(user.accountId, id, dto, user.id);
  }

  @Patch(':id/etapa')
  @ApiOperation({
    summary:
      'Move a demanda de etapa no board Kanban (mesmo enum de PATCH /videos/:id/etapa).',
  })
  updateEtapa(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateDemandaEtapaDto,
  ) {
    return this.demandasService.updateEtapa(
      user.accountId,
      id,
      dto.etapa,
      dto.posicao,
      user.id,
    );
  }

  @Post(':id/arquivar')
  @ApiOperation({ summary: 'Arquiva o card (sai do quadro, nao e apagado).' })
  archive(@CurrentUser() user: AuthUser, @Param('id', UUID) id: string) {
    return this.demandasService.archive(user.accountId, id, user.id);
  }

  @Post(':id/desarquivar')
  @ApiOperation({ summary: 'Devolve o card arquivado ao fim da sua coluna.' })
  unarchive(@CurrentUser() user: AuthUser, @Param('id', UUID) id: string) {
    return this.demandasService.unarchive(user.accountId, id, user.id);
  }

  @Post(':id/checklist')
  @ApiOperation({ summary: 'Adiciona um item ao checklist do card.' })
  addChecklistItem(
    @CurrentUser() user: AuthUser,
    @Param('id', UUID) id: string,
    @Body() dto: CreateChecklistItemDto,
  ) {
    return this.demandasService.addChecklistItem(user.accountId, id, dto);
  }

  @Patch(':id/checklist/:itemId')
  @ApiOperation({ summary: 'Edita texto, marca/desmarca ou reordena um item.' })
  updateChecklistItem(
    @CurrentUser() user: AuthUser,
    @Param('id', UUID) id: string,
    @Param('itemId', UUID) itemId: string,
    @Body() dto: UpdateChecklistItemDto,
  ) {
    return this.demandasService.updateChecklistItem(
      user.accountId,
      id,
      itemId,
      dto,
      user.id,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Um card (inclui quadroId/colunaId e arquivadaEm).' })
  findOne(@CurrentUser() user: AuthUser, @Param('id', UUID) id: string) {
    return this.demandasService.findOne(user.accountId, id);
  }

  @Patch(':id/coluna')
  @ApiOperation({ summary: 'Move um card de quadro extra para outra coluna do mesmo quadro.' })
  updateColuna(
    @CurrentUser() user: AuthUser,
    @Param('id', UUID) id: string,
    @Body() dto: UpdateDemandaColunaDto,
  ) {
    return this.demandasService.updateColuna(
      user.accountId,
      id,
      dto.colunaId,
      dto.posicao,
      user.id,
    );
  }

  @Post(':id/anexos/upload-url')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Passo 1/2 do anexo: URL assinada para enviar o arquivo direto ao R2.',
  })
  anexoUploadUrl(
    @CurrentUser() user: AuthUser,
    @Param('id', UUID) id: string,
    @Body() dto: AnexoUploadUrlDto,
  ) {
    return this.demandasService.createAnexoUploadUrl(user.accountId, id, dto);
  }

  @Post(':id/anexos')
  @ApiOperation({
    summary:
      'Passo 2/2: registra o anexo ja enviado. A primeira imagem vira capa. Devolve o card atualizado.',
  })
  addAnexo(
    @CurrentUser() user: AuthUser,
    @Param('id', UUID) id: string,
    @Body() dto: RegisterAnexoDto,
  ) {
    return this.demandasService.addAnexo(user.accountId, id, dto, user.id);
  }

  @Delete(':id/anexos/:anexoId')
  @ApiOperation({ summary: 'Remove o anexo (e o arquivo). Devolve o card atualizado.' })
  removeAnexo(
    @CurrentUser() user: AuthUser,
    @Param('id', UUID) id: string,
    @Param('anexoId', UUID) anexoId: string,
  ) {
    return this.demandasService.removeAnexo(user.accountId, id, anexoId, user.id);
  }

  @Patch(':id/capa')
  @ApiOperation({ summary: 'Define a capa do card (anexo de imagem) ou tira com null.' })
  setCapa(
    @CurrentUser() user: AuthUser,
    @Param('id', UUID) id: string,
    @Body() dto: SetCapaDto,
  ) {
    return this.demandasService.setCapa(
      user.accountId,
      id,
      dto.anexoId ?? null,
      dto.cor ?? null,
    );
  }

  @Post(':id/mover')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Move o card para outro quadro (quadroId) ou para o de producao (quadroId null + etapa).',
  })
  mover(
    @CurrentUser() user: AuthUser,
    @Param('id', UUID) id: string,
    @Body() dto: MoverDemandaDto,
  ) {
    return this.demandasService.mover(user.accountId, id, dto, user.id);
  }

  @Post(':id/copiar')
  @ApiOperation({
    summary:
      'Cria uma copia do card no destino (checklist, etiquetas e membros opcionais).',
  })
  copiar(
    @CurrentUser() user: AuthUser,
    @Param('id', UUID) id: string,
    @Body() dto: CopiarDemandaDto,
  ) {
    return this.demandasService.copiar(user.accountId, id, dto, user.id);
  }

  @Get(':id/comentarios')
  @ApiOperation({ summary: 'Comentarios do card, mais recente primeiro.' })
  listComentarios(@CurrentUser() user: AuthUser, @Param('id', UUID) id: string) {
    return this.demandasService.listComentarios(user.accountId, id);
  }

  @Post(':id/comentarios')
  @ApiOperation({
    summary:
      'Comenta no card. `mencionados` (ids) recebem notificacao de mencao; responsavel/colaboradores recebem aviso de comentario.',
  })
  addComentario(
    @CurrentUser() user: AuthUser,
    @Param('id', UUID) id: string,
    @Body() dto: CreateComentarioDto,
  ) {
    return this.demandasService.addComentario(user.accountId, id, dto, user.id);
  }

  @Patch(':id/comentarios/:comentarioId')
  @ApiOperation({ summary: 'Edita o proprio comentario.' })
  updateComentario(
    @CurrentUser() user: AuthUser,
    @Param('id', UUID) id: string,
    @Param('comentarioId', UUID) comentarioId: string,
    @Body() dto: UpdateComentarioDto,
  ) {
    return this.demandasService.updateComentario(
      user.accountId,
      id,
      comentarioId,
      dto,
      user,
    );
  }

  @Delete(':id/comentarios/:comentarioId')
  @ApiOperation({ summary: 'Apaga o comentario (autor ou owner).' })
  removeComentario(
    @CurrentUser() user: AuthUser,
    @Param('id', UUID) id: string,
    @Param('comentarioId', UUID) comentarioId: string,
  ) {
    return this.demandasService.removeComentario(
      user.accountId,
      id,
      comentarioId,
      user,
    );
  }

  @Get(':id/atividades')
  @ApiOperation({ summary: 'Historico do card (ultimas 200), mais recente primeiro.' })
  listAtividades(@CurrentUser() user: AuthUser, @Param('id', UUID) id: string) {
    return this.demandasService.listAtividades(user.accountId, id);
  }

  @Delete(':id/checklist/:itemId')
  @ApiOperation({ summary: 'Remove um item do checklist.' })
  removeChecklistItem(
    @CurrentUser() user: AuthUser,
    @Param('id', UUID) id: string,
    @Param('itemId', UUID) itemId: string,
  ) {
    return this.demandasService.removeChecklistItem(user.accountId, id, itemId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Exclui uma demanda.' })
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.demandasService.remove(user.accountId, id);
  }
}

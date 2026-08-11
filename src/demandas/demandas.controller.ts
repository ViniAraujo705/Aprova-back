import {
  Body,
  Controller,
  Delete,
  Get,
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
import { DemandasService } from './demandas.service';
import { CreateDemandaDto } from './dto/create-demanda.dto';
import { UpdateDemandaDto } from './dto/update-demanda.dto';
import { UpdateDemandaEtapaDto } from './dto/update-demanda-etapa.dto';

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
    return this.demandasService.create(user.accountId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lista as demandas da conta autenticada.' })
  findAll(@CurrentUser() user: AuthUser) {
    return this.demandasService.findAll(user.accountId);
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
    return this.demandasService.update(user.accountId, id, dto);
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
    return this.demandasService.updateEtapa(user.accountId, id, dto.etapa);
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

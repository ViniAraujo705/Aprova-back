import {
  Body,
  Controller,
  Delete,
  Get,
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
import { QuadrosService } from './quadros.service';
import {
  CreateColunaDto,
  CreateQuadroDto,
  RemoveColunaQueryDto,
  UpdateColunaDto,
  UpdateQuadroDto,
} from './dto/quadro.dto';

const UUID = new ParseUUIDPipe({ version: '4' });

@ApiTags('quadros')
@ApiBearerAuth()
@Controller('quadros')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.owner, UserRole.editor)
export class QuadrosController {
  constructor(private readonly quadrosService: QuadrosService) {}

  @Get()
  @ApiOperation({ summary: 'Quadros extras do Kanban, com as colunas em ordem.' })
  findAll(@CurrentUser() user: AuthUser) {
    return this.quadrosService.findAll(user.accountId);
  }

  @Post()
  @ApiOperation({ summary: 'Cria um quadro (colunas padrao: A fazer / Fazendo / Feito).' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateQuadroDto) {
    return this.quadrosService.create(user.accountId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', UUID) id: string,
    @Body() dto: UpdateQuadroDto,
  ) {
    return this.quadrosService.update(user.accountId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Apaga o quadro com todas as colunas e cards.' })
  remove(@CurrentUser() user: AuthUser, @Param('id', UUID) id: string) {
    return this.quadrosService.remove(user.accountId, id);
  }

  @Post(':id/colunas')
  addColuna(
    @CurrentUser() user: AuthUser,
    @Param('id', UUID) id: string,
    @Body() dto: CreateColunaDto,
  ) {
    return this.quadrosService.addColuna(user.accountId, id, dto);
  }

  @Patch(':id/colunas/:colunaId')
  @ApiOperation({ summary: 'Renomeia ou reordena (posicao) uma coluna.' })
  updateColuna(
    @CurrentUser() user: AuthUser,
    @Param('id', UUID) id: string,
    @Param('colunaId', UUID) colunaId: string,
    @Body() dto: UpdateColunaDto,
  ) {
    return this.quadrosService.updateColuna(user.accountId, id, colunaId, dto);
  }

  @Delete(':id/colunas/:colunaId')
  @ApiOperation({
    summary: 'Apaga a coluna. Com cards, exige ?moverPara=<outra coluna> (409 sem ele).',
  })
  removeColuna(
    @CurrentUser() user: AuthUser,
    @Param('id', UUID) id: string,
    @Param('colunaId', UUID) colunaId: string,
    @Query() query: RemoveColunaQueryDto,
  ) {
    return this.quadrosService.removeColuna(
      user.accountId,
      id,
      colunaId,
      query.moverPara,
    );
  }
}

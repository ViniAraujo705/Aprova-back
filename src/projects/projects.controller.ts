import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  CurrentUser,
  AuthUser,
} from '../auth/decorators/current-user.decorator';
import { ProjectsService } from './projects.service';
import { ProjectReportService } from '../reports/project-report.service';
import { PlansService } from '../plans/plans.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

@ApiTags('projects')
@ApiBearerAuth()
@Controller('projects')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.owner, UserRole.editor)
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly projectReportService: ProjectReportService,
    private readonly plansService: PlansService,
  ) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateProjectDto) {
    return this.projectsService.create(user.accountId, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.projectsService.findAll(user.accountId, user);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.projectsService.findOne(user.accountId, id, user);
  }

  @Get(':id/report')
  @ApiOperation({
    summary:
      'Gera o relatório do projeto em PDF (vídeos, status/versão, comentários por vídeo e notas médias por pergunta de avaliação). Download direto.',
  })
  @ApiProduces('application/pdf')
  async report(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Res() res: Response,
  ) {
    await this.plansService.assertFeature(user.accountId, 'pdfReports');
    const { buffer, filename } = await this.projectReportService.generate(
      user.accountId,
      id,
      user,
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length.toString(),
    });
    res.end(buffer);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projectsService.update(user.accountId, id, dto, user);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.projectsService.remove(user.accountId, id, user);
  }

  @Post(':id/members/:memberId')
  @Roles(UserRole.owner)
  @ApiOperation({
    summary:
      'Owner atribui um editor (ou owner) ao projeto. Idempotente. Retorna a lista de membros do projeto.',
  })
  addMember(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('memberId', new ParseUUIDPipe({ version: '4' })) memberId: string,
  ) {
    return this.projectsService.addMember(user.accountId, id, memberId);
  }

  @Delete(':id/members/:memberId')
  @Roles(UserRole.owner)
  @ApiOperation({
    summary:
      'Owner remove um editor do projeto. Retorna a lista de membros restante.',
  })
  removeMember(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('memberId', new ParseUUIDPipe({ version: '4' })) memberId: string,
  ) {
    return this.projectsService.removeMember(user.accountId, id, memberId);
  }
}

import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  CurrentUser,
  AuthUser,
} from '../auth/decorators/current-user.decorator';
import { CrewService } from './crew.service';
import { CreateCrewMemberDto } from './dto/create-crew-member.dto';

@ApiTags('crew')
@ApiBearerAuth()
@Controller('crew')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.owner, UserRole.editor)
export class CrewController {
  constructor(private readonly crewService: CrewService) {}

  @Post()
  @ApiOperation({
    summary:
      'Cadastra uma pessoa da equipe de gravacao (freelancer, motorista etc) — nao e um usuario do sistema.',
  })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCrewMemberDto) {
    return this.crewService.create(user.accountId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lista a equipe de gravacao da conta.' })
  findAll(@CurrentUser() user: AuthUser) {
    return this.crewService.findAll(user.accountId);
  }
}

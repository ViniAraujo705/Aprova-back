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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  AuthUser,
  CurrentUser,
} from '../auth/decorators/current-user.decorator';
import { ClientFieldsService } from './client-fields.service';
import { CreateClientFieldDto } from './dto/create-client-field.dto';
import { UpdateClientFieldDto } from './dto/update-client-field.dto';

@ApiTags('client-fields')
@ApiBearerAuth()
@Controller('client-fields')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClientFieldsController {
  constructor(private readonly clientFieldsService: ClientFieldsService) {}

  @Get()
  @Roles(UserRole.owner, UserRole.editor)
  findAll(@CurrentUser() user: AuthUser) {
    return this.clientFieldsService.findAll(user.accountId);
  }

  @Post()
  @Roles(UserRole.owner)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateClientFieldDto) {
    return this.clientFieldsService.create(user.accountId, dto);
  }

  @Patch(':id')
  @Roles(UserRole.owner)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateClientFieldDto,
  ) {
    return this.clientFieldsService.update(user.accountId, id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.owner)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.clientFieldsService.remove(user.accountId, id);
  }
}

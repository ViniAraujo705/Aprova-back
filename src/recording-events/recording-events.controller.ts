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
import { RecordingEventsService } from './recording-events.service';
import { CreateRecordingEventDto } from './dto/create-recording-event.dto';
import { UpdateRecordingEventDto } from './dto/update-recording-event.dto';

@ApiTags('recording-events')
@ApiBearerAuth()
@Controller('recording-events')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.owner, UserRole.editor)
export class RecordingEventsController {
  constructor(
    private readonly recordingEventsService: RecordingEventsService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Cria um evento no calendario de gravacoes.' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRecordingEventDto) {
    return this.recordingEventsService.create(user.accountId, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Lista os eventos do calendario de gravacoes da conta.',
  })
  findAll(@CurrentUser() user: AuthUser) {
    return this.recordingEventsService.findAll(user.accountId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Busca um evento do calendario por id.' })
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.recordingEventsService.findOne(user.accountId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza um evento do calendario de gravacoes.' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateRecordingEventDto,
  ) {
    return this.recordingEventsService.update(user.accountId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove um evento do calendario de gravacoes.' })
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.recordingEventsService.remove(user.accountId, id);
  }
}

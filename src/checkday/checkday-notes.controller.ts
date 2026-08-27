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
import {
  CurrentUser,
  AuthUser,
} from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CheckDayNotesService } from './checkday-notes.service';
import { CreateCheckDayNoteDto } from './dto/create-checkday-note.dto';
import { UpdateCheckDayNoteDto } from './dto/update-checkday-note.dto';
import { CheckDayImageUploadUrlDto } from './dto/checkday-image-upload-url.dto';

@ApiTags('checkday')
@ApiBearerAuth()
@Controller('checkday/notes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.owner, UserRole.editor)
export class CheckDayNotesController {
  constructor(private readonly notesService: CheckDayNotesService) {}

  @Get()
  @ApiOperation({
    summary: 'Lista as notas compartilhadas do CheckDay da conta.',
  })
  findAll(@CurrentUser() user: AuthUser) {
    return this.notesService.findAll(user.accountId);
  }

  @Post()
  @ApiOperation({ summary: 'Cria uma nota ou checklist no CheckDay.' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCheckDayNoteDto) {
    return this.notesService.create(user.accountId, user.id, dto);
  }

  @Post('image-upload-url')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Gera uma URL R2 pre-assinada para imagem de uma nota.',
  })
  createImageUploadUrl(@Body() dto: CheckDayImageUploadUrlDto) {
    return this.notesService.createImageUploadUrl(dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateCheckDayNoteDto,
  ) {
    return this.notesService.update(user.accountId, id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.notesService.remove(user.accountId, id);
  }
}

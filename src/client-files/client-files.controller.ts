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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  CurrentUser,
  AuthUser,
} from '../auth/decorators/current-user.decorator';
import { ClientFilesService } from './client-files.service';
import { ClientFileUploadUrlDto } from './dto/client-file-upload-url.dto';
import { RegisterClientFileDto } from './dto/register-client-file.dto';
import { UpdateClientFileDto } from './dto/update-client-file.dto';

/**
 * Arquivos operacionais do cliente (briefing, contrato, referencia,
 * roteiro, logo, etc.) - distintos dos videos de aprovacao. So
 * owner/editor da conta; nunca exposto em rota publica.
 */
@ApiTags('client-files')
@ApiBearerAuth()
@Controller('clients/:id/files')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.owner, UserRole.editor)
export class ClientFilesController {
  constructor(private readonly clientFilesService: ClientFilesService) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) clienteId: string,
  ) {
    return this.clientFilesService.findAll(user.accountId, clienteId);
  }

  @Post('upload-url')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Gera uma presigned URL para o upload do arquivo (R2). O frontend faz PUT direto na uploadUrl.',
  })
  createUploadUrl(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) clienteId: string,
    @Body() dto: ClientFileUploadUrlDto,
  ) {
    return this.clientFilesService.createUploadUrl(
      user.accountId,
      clienteId,
      dto,
    );
  }

  @Post()
  register(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) clienteId: string,
    @Body() dto: RegisterClientFileDto,
  ) {
    return this.clientFilesService.register(
      user.accountId,
      clienteId,
      user,
      dto,
    );
  }

  @Patch(':fileId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) clienteId: string,
    @Param('fileId', new ParseUUIDPipe({ version: '4' })) fileId: string,
    @Body() dto: UpdateClientFileDto,
  ) {
    return this.clientFilesService.update(
      user.accountId,
      clienteId,
      fileId,
      dto,
    );
  }

  @Delete(':fileId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) clienteId: string,
    @Param('fileId', new ParseUUIDPipe({ version: '4' })) fileId: string,
  ) {
    return this.clientFilesService.remove(
      user.accountId,
      clienteId,
      fileId,
      user,
    );
  }
}

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ClientActivityAtorTipo,
  ClientActivityType,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ClientActivityService } from '../client-activity/client-activity.service';
import { AuthUser } from '../auth/decorators/current-user.decorator';
import { ClientFileUploadUrlDto } from './dto/client-file-upload-url.dto';
import { RegisterClientFileDto } from './dto/register-client-file.dto';
import { UpdateClientFileDto } from './dto/update-client-file.dto';

// Arquivos operacionais (briefing/contrato/referencia/roteiro) nao tem o
// porte de um video - 100 MB cobre folgadamente PDF/doc/zip de referencia.
const MAX_CLIENT_FILE_SIZE_BYTES = 100 * 1024 * 1024;

@Injectable()
export class ClientFilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly clientActivity: ClientActivityService,
  ) {}

  async findAll(accountId: string, clienteId: string) {
    await this.findOwnedClient(accountId, clienteId);
    return this.prisma.clientFile.findMany({
      where: { clienteId },
      orderBy: { criadoEm: 'desc' },
    });
  }

  async createUploadUrl(
    accountId: string,
    clienteId: string,
    dto: ClientFileUploadUrlDto,
  ) {
    await this.findOwnedClient(accountId, clienteId);
    return this.storage.createPresignedUploadIn(
      'client-files',
      dto.nomeArquivo,
      dto.contentType,
    );
  }

  async register(
    accountId: string,
    clienteId: string,
    user: AuthUser,
    dto: RegisterClientFileDto,
  ) {
    await this.findOwnedClient(accountId, clienteId);
    const tamanhoBytes = await this.validateUploadedFile(dto.urlStorage);

    const file = await this.prisma.clientFile.create({
      data: {
        accountId,
        clienteId,
        nomeArquivo: dto.nomeArquivo,
        urlStorage: dto.urlStorage,
        mimeType: dto.mimeType,
        tamanhoBytes,
        categoria: dto.categoria,
        descricao: dto.descricao,
        enviadoPorId: user.id,
      },
    });

    await this.clientActivity.log({
      accountId,
      clienteId,
      tipo: ClientActivityType.arquivo_enviado,
      atorTipo:
        user.role === UserRole.owner
          ? ClientActivityAtorTipo.owner
          : ClientActivityAtorTipo.editor,
      atorNome: user.nome,
      arquivoId: file.id,
      descricao: file.nomeArquivo,
    });

    return file;
  }

  async update(
    accountId: string,
    clienteId: string,
    fileId: string,
    dto: UpdateClientFileDto,
  ) {
    await this.findOwnedClient(accountId, clienteId);
    await this.findOwnedFile(clienteId, fileId);
    return this.prisma.clientFile.update({
      where: { id: fileId },
      data: dto,
    });
  }

  async remove(
    accountId: string,
    clienteId: string,
    fileId: string,
    user: AuthUser,
  ) {
    await this.findOwnedClient(accountId, clienteId);
    const file = await this.findOwnedFile(clienteId, fileId);

    await this.prisma.clientFile.delete({ where: { id: fileId } });

    const key = this.storage.keyFromPublicUrl(file.urlStorage);
    if (key) {
      await this.storage.deleteObject(key).catch(() => undefined);
    }

    await this.clientActivity.log({
      accountId,
      clienteId,
      tipo: ClientActivityType.arquivo_removido,
      atorTipo:
        user.role === UserRole.owner
          ? ClientActivityAtorTipo.owner
          : ClientActivityAtorTipo.editor,
      atorNome: user.nome,
      descricao: file.nomeArquivo,
    });

    return { deleted: true };
  }

  private async findOwnedClient(accountId: string, clienteId: string) {
    const client = await this.prisma.client.findFirst({
      where: { id: clienteId, accountId },
      select: { id: true },
    });
    if (!client) {
      throw new NotFoundException('Cliente nao encontrado');
    }
    return client;
  }

  private async findOwnedFile(clienteId: string, fileId: string) {
    const file = await this.prisma.clientFile.findFirst({
      where: { id: fileId, clienteId },
    });
    if (!file) {
      throw new NotFoundException('Arquivo nao encontrado');
    }
    return file;
  }

  /**
   * Confirma que o PUT direto ao R2 realmente aconteceu e retorna o
   * tamanho real do objeto (nunca confia num tamanho reportado pelo
   * cliente) - mesmo padrao de VideosService.validateUploadedFile.
   */
  private async validateUploadedFile(
    urlStorage: string,
  ): Promise<number | null> {
    const key = this.storage.keyFromPublicUrl(urlStorage);
    if (!key) {
      throw new BadRequestException('urlStorage invalido');
    }

    const { exists, sizeBytes } = await this.storage.headObject(key);
    if (!exists) {
      throw new BadRequestException(
        'Arquivo nao encontrado no storage. O upload pode ter falhado ou a URL expirado; tente novamente.',
      );
    }

    if (sizeBytes !== null && sizeBytes > MAX_CLIENT_FILE_SIZE_BYTES) {
      await this.storage.deleteObject(key).catch(() => undefined);
      const maxMb = Math.floor(MAX_CLIENT_FILE_SIZE_BYTES / (1024 * 1024));
      throw new BadRequestException(
        `Arquivo excede o tamanho maximo permitido (${maxMb} MB).`,
      );
    }

    return sizeBytes;
  }
}

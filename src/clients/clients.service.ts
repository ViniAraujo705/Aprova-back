import { Injectable, NotFoundException } from '@nestjs/common';
import { Client } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { PlansService } from '../plans/plans.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { ClientPhotoUploadUrlDto } from './dto/client-photo-upload-url.dto';
import { ClientBrandingLogoUploadUrlDto } from './dto/client-branding-logo-upload-url.dto';
import { UpdateClientBrandingDto } from './dto/update-client-branding.dto';

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly plans: PlansService,
  ) {}

  async create(accountId: string, dto: CreateClientDto) {
    await this.plans.assertCanAddClient(accountId);
    const client = await this.prisma.client.create({
      data: {
        nome: dto.nome,
        email: dto.email,
        descricao: dto.descricao,
        fotoUrl: dto.fotoUrl,
        accountId,
      },
    });
    return this.toResponse(client);
  }

  async findAll(accountId: string) {
    const clients = await this.prisma.client.findMany({
      where: { accountId },
      orderBy: { nome: 'asc' },
    });
    return clients.map((c) => this.toResponse(c));
  }

  async findOne(accountId: string, id: string) {
    const client = await this.findOwnedClient(accountId, id);
    return this.toResponse(client);
  }

  async update(accountId: string, id: string, dto: UpdateClientDto) {
    // Garante que o cliente pertence a conta antes de atualizar
    await this.findOwnedClient(accountId, id);
    const client = await this.prisma.client.update({
      where: { id },
      data: dto,
    });
    return this.toResponse(client);
  }

  /**
   * Exclui o cliente e, em cascata (schema), seus projetos/videos/comentarios.
   * A cascata do banco nao limpa os arquivos no R2, entao coletamos as URLs
   * (foto do cliente, arquivos de video e audios de comentario) antes de
   * apagar as linhas e removemos os objetos do storage depois.
   */
  async remove(accountId: string, id: string) {
    const client = await this.findOwnedClient(accountId, id);

    const videos = await this.prisma.video.findMany({
      where: { project: { clientId: id, accountId } },
      select: {
        urlStorage: true,
        urlOtimizada: true,
        thumbnailUrl: true,
        comments: { select: { audioUrl: true } },
      },
    });

    await this.prisma.client.delete({ where: { id } });

    const urls = [
      client.fotoUrl,
      ...videos.flatMap((v) => [
        v.urlStorage,
        v.urlOtimizada,
        v.thumbnailUrl,
        ...v.comments.map((c) => c.audioUrl),
      ]),
    ];
    await this.deleteStorageObjects(urls);

    return { deleted: true };
  }

  private async deleteStorageObjects(
    urls: Array<string | null | undefined>,
  ): Promise<void> {
    const keys = urls
      .filter((url): url is string => !!url)
      .map((url) => this.storage.keyFromPublicUrl(url))
      .filter((key): key is string => !!key);

    await Promise.all(
      keys.map((key) => this.storage.deleteObject(key).catch(() => undefined)),
    );
  }

  /**
   * Gera uma presigned URL para o upload da foto do cliente,
   * reaproveitando a mesma mecanica de upload do R2 usada no logo da
   * agencia (pasta dedicada `clients`).
   */
  createPhotoUploadUrl(dto: ClientPhotoUploadUrlDto) {
    return this.storage.createPresignedUploadIn(
      'clients',
      dto.nomeArquivo,
      dto.contentType,
    );
  }

  /**
   * Gera uma presigned URL para o upload do logo proprio do cliente,
   * mesma mecanica do logo da agencia (POST /users/me/branding/logo-upload-url),
   * so que numa pasta dedicada (`client-branding`). So owner - mesma regra
   * do branding da agencia.
   */
  async createBrandingLogoUploadUrl(
    accountId: string,
    id: string,
    dto: ClientBrandingLogoUploadUrlDto,
  ) {
    await this.findOwnedClient(accountId, id);
    return this.storage.createPresignedUploadIn(
      'client-branding',
      dto.nomeArquivo,
      dto.contentType,
    );
  }

  /**
   * Atualiza a marca propria do cliente (logo + cor de destaque). null
   * limpa o campo (volta a herdar o branding da agencia); ausente deixa
   * como esta. Mesma gate de plano do branding da agencia (whiteLabel).
   */
  async updateBranding(
    accountId: string,
    id: string,
    dto: UpdateClientBrandingDto,
  ) {
    await this.findOwnedClient(accountId, id);
    if (dto.logoUrl !== undefined || dto.corDestaque !== undefined) {
      await this.plans.assertFeature(accountId, 'whiteLabel');
    }

    const client = await this.prisma.client.update({
      where: { id },
      data: {
        ...(dto.logoUrl !== undefined ? { logoUrl: dto.logoUrl } : {}),
        ...(dto.corDestaque !== undefined
          ? { corDestaque: dto.corDestaque }
          : {}),
      },
      select: { logoUrl: true, corDestaque: true },
    });
    return client;
  }

  private async findOwnedClient(accountId: string, id: string) {
    const client = await this.prisma.client.findFirst({
      where: { id, accountId },
    });
    if (!client) {
      throw new NotFoundException('Cliente nao encontrado');
    }
    return client;
  }

  private toResponse(client: Client) {
    const { logoUrl, corDestaque, ...rest } = client;
    return {
      ...rest,
      branding:
        logoUrl || corDestaque
          ? { logoUrl: logoUrl ?? null, corDestaque: corDestaque ?? null }
          : null,
    };
  }
}

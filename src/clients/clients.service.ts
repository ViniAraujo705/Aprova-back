import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { PlansService } from '../plans/plans.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { ClientPhotoUploadUrlDto } from './dto/client-photo-upload-url.dto';

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly plans: PlansService,
  ) {}

  async create(accountId: string, dto: CreateClientDto) {
    await this.plans.assertCanAddClient(accountId);
    return this.prisma.client.create({
      data: {
        nome: dto.nome,
        email: dto.email,
        descricao: dto.descricao,
        fotoUrl: dto.fotoUrl,
        accountId,
      },
    });
  }

  findAll(accountId: string) {
    return this.prisma.client.findMany({
      where: { accountId },
      orderBy: { nome: 'asc' },
    });
  }

  async findOne(accountId: string, id: string) {
    const client = await this.prisma.client.findFirst({
      where: { id, accountId },
    });
    if (!client) {
      throw new NotFoundException('Cliente nao encontrado');
    }
    return client;
  }

  async update(accountId: string, id: string, dto: UpdateClientDto) {
    // Garante que o cliente pertence a conta antes de atualizar
    await this.findOne(accountId, id);
    return this.prisma.client.update({
      where: { id },
      data: dto,
    });
  }

  async remove(accountId: string, id: string) {
    await this.findOne(accountId, id);
    await this.prisma.client.delete({ where: { id } });
    return { deleted: true };
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
}

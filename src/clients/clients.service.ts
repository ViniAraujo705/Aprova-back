import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  create(accountId: string, dto: CreateClientDto) {
    return this.prisma.client.create({
      data: {
        nome: dto.nome,
        email: dto.email,
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
}

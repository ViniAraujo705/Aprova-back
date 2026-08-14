import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClientField } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClientFieldDto } from './dto/create-client-field.dto';
import { UpdateClientFieldDto } from './dto/update-client-field.dto';

@Injectable()
export class ClientFieldsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(accountId: string) {
    const fields = await this.prisma.clientField.findMany({
      where: { accountId },
      orderBy: [{ ordem: 'asc' }, { criadoEm: 'asc' }, { id: 'asc' }],
    });
    return fields.map((field) => this.toResponse(field));
  }

  async create(accountId: string, dto: CreateClientFieldDto) {
    const rotulo = this.normalizeRotulo(dto.rotulo);
    const last = await this.prisma.clientField.findFirst({
      where: { accountId },
      orderBy: { ordem: 'desc' },
      select: { ordem: true },
    });
    const field = await this.prisma.clientField.create({
      data: {
        accountId,
        rotulo,
        ordem: (last?.ordem ?? -1) + 1,
      },
    });
    return this.toResponse(field);
  }

  async update(accountId: string, id: string, dto: UpdateClientFieldDto) {
    const field = await this.prisma.$transaction(async (tx) => {
      const current = await tx.clientField.findFirst({
        where: { id, accountId },
      });
      if (!current) {
        throw new NotFoundException('Campo de cliente nao encontrado');
      }

      if (dto.ordem !== undefined && dto.ordem !== current.ordem) {
        const fieldAtNewPosition = await tx.clientField.findFirst({
          where: { accountId, ordem: dto.ordem, NOT: { id } },
          select: { id: true },
        });
        if (fieldAtNewPosition) {
          await tx.clientField.update({
            where: { id: fieldAtNewPosition.id },
            data: { ordem: current.ordem },
          });
        }
      }

      return tx.clientField.update({
        where: { id },
        data: {
          ...(dto.rotulo !== undefined
            ? { rotulo: this.normalizeRotulo(dto.rotulo) }
            : {}),
          ...(dto.ordem !== undefined ? { ordem: dto.ordem } : {}),
        },
      });
    });
    return this.toResponse(field);
  }

  async remove(accountId: string, id: string) {
    const field = await this.prisma.clientField.findFirst({
      where: { id, accountId },
      select: { id: true },
    });
    if (!field) throw new NotFoundException('Campo de cliente nao encontrado');

    await this.prisma.clientField.delete({ where: { id } });
    return { deleted: true };
  }

  private toResponse(field: ClientField) {
    return { id: field.id, rotulo: field.rotulo, ordem: field.ordem };
  }

  private normalizeRotulo(rotulo: string) {
    const normalized = rotulo.trim();
    if (!normalized) {
      throw new BadRequestException('Rotulo do campo nao pode ser vazio');
    }
    return normalized;
  }
}

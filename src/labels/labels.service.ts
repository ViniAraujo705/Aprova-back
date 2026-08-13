import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLabelDto } from './dto/create-label.dto';
import { UpdateLabelDto } from './dto/update-label.dto';

@Injectable()
export class LabelsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(accountId: string) {
    return this.prisma.label.findMany({
      where: { accountId },
      orderBy: [{ criadoEm: 'asc' }, { id: 'asc' }],
    });
  }

  create(accountId: string, dto: CreateLabelDto) {
    return this.prisma.label.create({
      data: { accountId, text: dto.text.trim(), color: dto.color },
    });
  }

  async update(accountId: string, id: string, dto: UpdateLabelDto) {
    await this.getOwned(accountId, id);
    return this.prisma.label.update({
      where: { id },
      data: {
        ...(dto.text !== undefined ? { text: dto.text.trim() } : {}),
        ...(dto.color !== undefined ? { color: dto.color } : {}),
      },
    });
  }

  async remove(accountId: string, id: string) {
    await this.getOwned(accountId, id);
    await this.prisma.label.delete({ where: { id } });
    return { deleted: true };
  }

  private async getOwned(accountId: string, id: string) {
    const label = await this.prisma.label.findFirst({
      where: { id, accountId },
      select: { id: true },
    });
    if (!label) throw new NotFoundException('Label nao encontrada');
    return label;
  }
}

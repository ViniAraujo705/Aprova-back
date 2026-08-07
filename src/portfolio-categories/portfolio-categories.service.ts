import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePortfolioCategoryDto } from './dto/create-portfolio-category.dto';
import { UpdatePortfolioCategoryDto } from './dto/update-portfolio-category.dto';

@Injectable()
export class PortfolioCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(accountId: string) {
    return this.prisma.portfolioCategory.findMany({
      where: { accountId },
      orderBy: { ordem: 'asc' },
    });
  }

  async create(accountId: string, dto: CreatePortfolioCategoryDto) {
    // Nova categoria entra no fim da lista (maior ordem + 1).
    const last = await this.prisma.portfolioCategory.findFirst({
      where: { accountId },
      orderBy: { ordem: 'desc' },
      select: { ordem: true },
    });
    return this.prisma.portfolioCategory.create({
      data: { accountId, nome: dto.nome, ordem: (last?.ordem ?? -1) + 1 },
    });
  }

  async update(accountId: string, id: string, dto: UpdatePortfolioCategoryDto) {
    await this.assertOwned(accountId, id);
    return this.prisma.portfolioCategory.update({
      where: { id },
      data: dto,
    });
  }

  /**
   * Exclui a categoria. Os albuns dela nao sao apagados - so desassociados
   * (categoriaId: null), via onDelete: SetNull no schema (Portfolio.categoria).
   */
  async remove(accountId: string, id: string) {
    await this.assertOwned(accountId, id);
    await this.prisma.portfolioCategory.delete({ where: { id } });
    return { deleted: true };
  }

  private async assertOwned(accountId: string, id: string) {
    const category = await this.prisma.portfolioCategory.findFirst({
      where: { id, accountId },
      select: { id: true },
    });
    if (!category) {
      throw new NotFoundException('Categoria de portfolio nao encontrada');
    }
  }
}

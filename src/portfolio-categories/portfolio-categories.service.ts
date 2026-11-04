import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreatePortfolioCategoryDto } from './dto/create-portfolio-category.dto';
import { UpdatePortfolioCategoryDto } from './dto/update-portfolio-category.dto';
import { PortfolioCategoryCoverUploadUrlDto } from './dto/cover-upload-url.dto';

@Injectable()
export class PortfolioCategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

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
   * Presigned URL pra capa da aba - mesmo contrato de 2 passos de
   * POST /portfolios/:id/cover-upload-url: o front faz PUT na uploadUrl e
   * depois manda a publicUrl em PATCH /portfolio-categories/:id { capaUrl }.
   * Sem passo de confirmacao.
   */
  async createCoverUploadUrl(
    accountId: string,
    id: string,
    dto: PortfolioCategoryCoverUploadUrlDto,
  ) {
    await this.assertOwned(accountId, id);
    return this.storage.createPresignedUploadIn(
      'portfolio-category-covers',
      dto.nomeArquivo,
      dto.contentType,
    );
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

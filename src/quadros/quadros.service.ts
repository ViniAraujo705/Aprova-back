import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateColunaDto,
  CreateQuadroDto,
  UpdateColunaDto,
  UpdateFundoProducaoDto,
  UpdateQuadroDto,
} from './dto/quadro.dto';

const PASSO = 1024;
const COLUNAS_PADRAO = ['A fazer', 'Fazendo', 'Feito'];

const QUADRO_SELECT = {
  id: true,
  nome: true,
  posicao: true,
  fundo: true,
  criadoEm: true,
  colunas: {
    select: { id: true, nome: true, posicao: true },
    orderBy: { posicao: 'asc' as const },
  },
  _count: { select: { demandas: { where: { arquivadaEm: null } } } },
} as const;

type RawQuadro = { _count: { demandas: number } } & Record<string, unknown>;
const toDto = ({ _count, ...rest }: RawQuadro) => ({
  ...rest,
  demandasCount: _count.demandas,
});

/**
 * Quadros extras do Kanban: colunas livres criadas pela agencia, ao lado do
 * quadro de producao (7 etapas fixas, que nao vive nesta tabela).
 */
@Injectable()
export class QuadrosService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(accountId: string) {
    const quadros = await this.prisma.quadro.findMany({
      where: { accountId },
      orderBy: [{ posicao: 'asc' }, { criadoEm: 'asc' }],
      select: QUADRO_SELECT,
    });
    return quadros.map(toDto);
  }

  /** O quadro de producao nao e uma linha de Quadro: o fundo fica na conta. */
  async getProducao(accountId: string) {
    const conta = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { kanbanFundo: true },
    });
    return { fundo: conta?.kanbanFundo ?? null };
  }

  async updateProducao(accountId: string, dto: UpdateFundoProducaoDto) {
    const conta = await this.prisma.account.update({
      where: { id: accountId },
      data: { kanbanFundo: dto.fundo ?? null },
      select: { kanbanFundo: true },
    });
    return { fundo: conta.kanbanFundo };
  }

  async create(accountId: string, dto: CreateQuadroDto) {
    const nomes = (dto.colunas ?? COLUNAS_PADRAO)
      .map((n) => n.trim())
      .filter(Boolean);
    if (nomes.length === 0) {
      throw new BadRequestException('O quadro precisa de ao menos uma coluna');
    }
    const ultimo = await this.prisma.quadro.aggregate({
      where: { accountId },
      _max: { posicao: true },
    });
    const quadro = await this.prisma.quadro.create({
      data: {
        accountId,
        nome: dto.nome,
        posicao: (ultimo._max.posicao ?? 0) + PASSO,
        colunas: {
          create: nomes.map((nome, i) => ({ nome, posicao: (i + 1) * PASSO })),
        },
      },
      select: QUADRO_SELECT,
    });
    return toDto(quadro);
  }

  async update(accountId: string, id: string, dto: UpdateQuadroDto) {
    await this.getOwned(accountId, id);
    const quadro = await this.prisma.quadro.update({
      where: { id },
      data: dto,
      select: QUADRO_SELECT,
    });
    return toDto(quadro);
  }

  /** Apaga o quadro com todas as colunas e cards (inclusive arquivados). */
  async remove(accountId: string, id: string) {
    await this.getOwned(accountId, id);
    await this.prisma.quadro.delete({ where: { id } });
    return { deleted: true };
  }

  async addColuna(accountId: string, quadroId: string, dto: CreateColunaDto) {
    await this.getOwned(accountId, quadroId);
    const total = await this.prisma.quadroColuna.count({ where: { quadroId } });
    if (total >= 30) {
      throw new BadRequestException('Limite de 30 colunas por quadro');
    }
    const ultima = await this.prisma.quadroColuna.aggregate({
      where: { quadroId },
      _max: { posicao: true },
    });
    await this.prisma.quadroColuna.create({
      data: {
        quadroId,
        nome: dto.nome,
        posicao: (ultima._max.posicao ?? 0) + PASSO,
      },
    });
    return this.findOne(quadroId);
  }

  async updateColuna(
    accountId: string,
    quadroId: string,
    colunaId: string,
    dto: UpdateColunaDto,
  ) {
    await this.getOwnedColuna(accountId, quadroId, colunaId);
    await this.prisma.quadroColuna.update({
      where: { id: colunaId },
      data: dto,
    });
    return this.findOne(quadroId);
  }

  /**
   * Apaga a coluna. Se ela tem cards (ativos ou arquivados), exige
   * `moverPara` (outra coluna do mesmo quadro), para nada sumir sem querer.
   */
  async removeColuna(
    accountId: string,
    quadroId: string,
    colunaId: string,
    moverPara?: string,
  ) {
    await this.getOwnedColuna(accountId, quadroId, colunaId);
    const total = await this.prisma.quadroColuna.count({ where: { quadroId } });
    if (total <= 1) {
      throw new BadRequestException('O quadro precisa de ao menos uma coluna');
    }
    const cards = await this.prisma.demanda.count({ where: { colunaId } });
    if (cards > 0) {
      if (!moverPara) {
        throw new ConflictException(
          'A coluna tem cards: informe para qual coluna move-los',
        );
      }
      if (moverPara === colunaId) {
        throw new BadRequestException('Escolha outra coluna');
      }
      await this.getOwnedColuna(accountId, quadroId, moverPara);
      const ultima = await this.prisma.demanda.aggregate({
        where: { colunaId: moverPara },
        _max: { posicao: true },
      });
      const base = ultima._max.posicao ?? 0;
      const movidos = await this.prisma.demanda.findMany({
        where: { colunaId },
        orderBy: { posicao: 'asc' },
        select: { id: true },
      });
      await this.prisma.$transaction(
        movidos.map((d, i) =>
          this.prisma.demanda.update({
            where: { id: d.id },
            data: { colunaId: moverPara, posicao: base + (i + 1) * PASSO },
          }),
        ),
      );
    }
    await this.prisma.quadroColuna.delete({ where: { id: colunaId } });
    return this.findOne(quadroId);
  }

  private async findOne(id: string) {
    const quadro = await this.prisma.quadro.findUniqueOrThrow({
      where: { id },
      select: QUADRO_SELECT,
    });
    return toDto(quadro);
  }

  private async getOwned(accountId: string, id: string) {
    const quadro = await this.prisma.quadro.findFirst({
      where: { id, accountId },
      select: { id: true },
    });
    if (!quadro) throw new NotFoundException('Quadro nao encontrado');
    return quadro;
  }

  private async getOwnedColuna(
    accountId: string,
    quadroId: string,
    colunaId: string,
  ) {
    const coluna = await this.prisma.quadroColuna.findFirst({
      where: { id: colunaId, quadroId, quadro: { accountId } },
      select: { id: true },
    });
    if (!coluna) throw new NotFoundException('Coluna nao encontrada');
    return coluna;
  }
}

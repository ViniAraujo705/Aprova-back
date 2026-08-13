import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PortfolioMediaType, Plan, PortfolioVideo } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { createWithUniqueSlugLinkPublico } from '../common/short-id.util';
import { StorageService } from '../storage/storage.service';
import { PlansService } from '../plans/plans.service';
import { VideoProcessingService } from '../videos/processing/video-processing.service';
import {
  VIDEO_PROCESSING_PRIORITY_DEFAULT,
  VIDEO_PROCESSING_PRIORITY_HIGH,
} from '../videos/processing/video-processing.constants';
import { CreatePortfolioDto } from './dto/create-portfolio.dto';
import { UpdatePortfolioDto } from './dto/update-portfolio.dto';
import { AddExistingVideoDto } from './dto/add-existing-video.dto';
import { PortfolioUploadUrlDto } from './dto/upload-url.dto';
import { PortfolioUploadCompleteDto } from './dto/upload-complete.dto';
import { UpdatePortfolioVideoDto } from './dto/update-portfolio-video.dto';
import { ReorderPortfolioVideosDto } from './dto/reorder-portfolio-videos.dto';
import { PortfolioCoverUploadUrlDto } from './dto/cover-upload-url.dto';

const DEFAULT_MAX_VIDEO_SIZE_MB = 2048; // 2 GB

const PORTFOLIO_VIDEOS_ORDER = { ordem: 'asc' as const };

@Injectable()
export class PortfoliosService {
  private readonly maxVideoSizeBytes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly processing: VideoProcessingService,
    private readonly plans: PlansService,
    config: ConfigService,
  ) {
    const maxMb =
      Number(config.get<string>('VIDEO_MAX_SIZE_MB')) ||
      DEFAULT_MAX_VIDEO_SIZE_MB;
    this.maxVideoSizeBytes = maxMb * 1024 * 1024;
  }

  async list(accountId: string) {
    const portfolios = await this.prisma.portfolio.findMany({
      where: { accountId },
      orderBy: { criadoEm: 'desc' },
      include: {
        videos: {
          orderBy: PORTFOLIO_VIDEOS_ORDER,
          take: 1,
          select: { posterUrl: true },
        },
      },
    });
    return portfolios.map((p) => this.toSummary(p));
  }

  async findOne(accountId: string, id: string) {
    const portfolio = await this.getOwnedPortfolio(accountId, id);
    return this.toResponse(portfolio);
  }

  async create(accountId: string, dto: CreatePortfolioDto) {
    if (dto.categoriaId) {
      await this.assertCategoryOwned(accountId, dto.categoriaId);
    }
    const portfolio = await createWithUniqueSlugLinkPublico(
      dto.nome,
      (linkPublico) =>
        this.prisma.portfolio.create({
          data: {
            accountId,
            nome: dto.nome,
            descricao: dto.descricao ?? null,
            categoriaId: dto.categoriaId ?? null,
            linkPublico,
          },
          include: { videos: true },
        }),
    );
    return this.toResponse(portfolio);
  }

  async update(accountId: string, id: string, dto: UpdatePortfolioDto) {
    await this.getOwnedPortfolio(accountId, id);
    if (dto.categoriaId) {
      await this.assertCategoryOwned(accountId, dto.categoriaId);
    }
    if (dto.clienteId) {
      await this.assertClientOwned(accountId, dto.clienteId);
    }
    const portfolio = await this.prisma.portfolio.update({
      where: { id },
      data: dto,
      include: { videos: { orderBy: PORTFOLIO_VIDEOS_ORDER } },
    });
    return this.toResponse(portfolio);
  }

  async remove(accountId: string, id: string) {
    const portfolio = await this.getOwnedPortfolio(accountId, id);

    await this.prisma.portfolio.delete({ where: { id } });

    // Cascade ja apagou as linhas de PortfolioVideo; so falta limpar os
    // arquivos no R2 dos que foram upload dedicado (sourceVideoId nulo) -
    // os referenciados de um Video existente apontam pro MESMO arquivo do
    // video original, apagar destruiria o video original tambem.
    const ownUploads = portfolio.videos.filter((v) => !v.sourceVideoId);
    await this.deleteStorageObjects(
      ownUploads.flatMap((v) => [v.urlStorage, v.urlOtimizada, v.posterUrl]),
    );

    return { deleted: true };
  }

  /** Adiciona ao portfolio um video ja existente em algum projeto da conta - copia (denormaliza) urlStorage/posterUrl nesse momento. */
  async addExistingVideo(
    accountId: string,
    portfolioId: string,
    dto: AddExistingVideoDto,
  ) {
    await this.getOwnedPortfolio(accountId, portfolioId);

    const video = await this.prisma.video.findFirst({
      where: { id: dto.videoId, project: { accountId } },
      select: {
        id: true,
        nomeArquivo: true,
        urlStorage: true,
        urlOtimizada: true,
        thumbnailUrl: true,
        statusProcessamento: true,
        duracaoSegundos: true,
      },
    });
    if (!video) {
      throw new NotFoundException(
        'Video nao encontrado ou nao pertence a esta conta',
      );
    }

    const ordem = await this.nextOrdem(portfolioId);
    await this.prisma.portfolioVideo.create({
      data: {
        portfolioId,
        sourceVideoId: video.id,
        // Sempre "video" - nao existe equivalente pra foto (ver
        // AddExistingVideoDto).
        tipoMidia: PortfolioMediaType.video,
        titulo: dto.titulo || video.nomeArquivo,
        descricao: dto.descricao ?? null,
        urlStorage: video.urlStorage,
        urlOtimizada: video.urlOtimizada,
        posterUrl: video.thumbnailUrl,
        statusProcessamento: video.statusProcessamento,
        duracaoSegundos: video.duracaoSegundos,
        ordem,
      },
    });

    return this.findOne(accountId, portfolioId);
  }

  async createUploadUrl(
    accountId: string,
    portfolioId: string,
    dto: PortfolioUploadUrlDto,
  ) {
    await this.getOwnedPortfolio(accountId, portfolioId);
    return this.storage.createPresignedUploadIn(
      'portfolio',
      dto.nomeArquivo,
      dto.contentType,
    );
  }

  /**
   * Presigned URL so de imagem pra capa do album - sem passo de
   * confirmacao: a publicUrl retornada aqui vai direto num
   * PATCH /portfolios/:id { capaUrl }.
   */
  async createCoverUploadUrl(
    accountId: string,
    portfolioId: string,
    dto: PortfolioCoverUploadUrlDto,
  ) {
    await this.getOwnedPortfolio(accountId, portfolioId);
    return this.storage.createPresignedUploadIn(
      'portfolio-covers',
      dto.nomeArquivo,
      dto.contentType,
    );
  }

  /**
   * Registra, direto no portfolio, uma midia enviada pelo passo de
   * upload-url - sem projeto/cliente por tras. Foto e design nao passam pelo
   * pipeline de thumbnail/otimizacao: a propria imagem vira `posterUrl`
   * (thumbnail e tela cheia sao a mesma imagem) e `urlStorage` do item fica
   * null - so video enfileira processamento em background.
   */
  async uploadComplete(
    accountId: string,
    portfolioId: string,
    dto: PortfolioUploadCompleteDto,
  ) {
    await this.getOwnedPortfolio(accountId, portfolioId);
    await this.validateUploadedFile(dto.urlStorage);

    const ordem = await this.nextOrdem(portfolioId);
    const isImage = dto.tipoMidia !== PortfolioMediaType.video;
    const portfolioVideo = await this.prisma.portfolioVideo.create({
      data: {
        portfolioId,
        tipoMidia: dto.tipoMidia,
        titulo: dto.titulo || dto.nomeArquivo,
        descricao: dto.descricao ?? null,
        urlStorage: isImage ? null : dto.urlStorage,
        posterUrl: isImage ? dto.urlStorage : null,
        statusProcessamento: isImage ? 'pronto' : 'processando',
        ordem,
      },
    });

    if (!isImage) {
      await this.processing.enqueue(
        'portfolioVideo',
        portfolioVideo.id,
        await this.processingPriority(accountId),
      );
    }

    return this.findOne(accountId, portfolioId);
  }

  async updateVideo(
    accountId: string,
    portfolioId: string,
    videoId: string,
    dto: UpdatePortfolioVideoDto,
  ) {
    await this.getOwnedPortfolioVideo(accountId, portfolioId, videoId);
    await this.prisma.portfolioVideo.update({
      where: { id: videoId },
      data: dto,
    });
    return this.findOne(accountId, portfolioId);
  }

  async removeVideo(accountId: string, portfolioId: string, videoId: string) {
    const video = await this.getOwnedPortfolioVideo(
      accountId,
      portfolioId,
      videoId,
    );

    await this.prisma.portfolioVideo.delete({ where: { id: videoId } });

    // So apaga os arquivos do R2 se foi upload dedicado (sourceVideoId
    // nulo) - remover um video referenciado de um projeto nunca pode
    // afetar o arquivo do video original.
    if (!video.sourceVideoId) {
      await this.deleteStorageObjects([
        video.urlStorage,
        video.urlOtimizada,
        video.posterUrl,
      ]);
    }

    return this.findOne(accountId, portfolioId);
  }

  async reorder(
    accountId: string,
    portfolioId: string,
    dto: ReorderPortfolioVideosDto,
  ) {
    const portfolio = await this.getOwnedPortfolio(accountId, portfolioId);
    const currentIds = new Set(portfolio.videos.map((v) => v.id));
    const sameSet =
      dto.videoIds.length === currentIds.size &&
      dto.videoIds.every((id) => currentIds.has(id));
    if (!sameSet) {
      throw new BadRequestException(
        'videoIds precisa conter exatamente os videos atuais do portfolio',
      );
    }

    await this.prisma.$transaction(
      dto.videoIds.map((id, ordem) =>
        this.prisma.portfolioVideo.update({
          where: { id },
          data: { ordem },
        }),
      ),
    );

    return this.findOne(accountId, portfolioId);
  }

  private async nextOrdem(portfolioId: string): Promise<number> {
    const last = await this.prisma.portfolioVideo.findFirst({
      where: { portfolioId },
      orderBy: { ordem: 'desc' },
      select: { ordem: true },
    });
    return last ? last.ordem + 1 : 0;
  }

  /** Contas no plano Agencia processam antes das demais na fila. */
  private async processingPriority(accountId: string): Promise<number> {
    const plan = await this.plans.getPlan(accountId);
    return plan === Plan.agencia
      ? VIDEO_PROCESSING_PRIORITY_HIGH
      : VIDEO_PROCESSING_PRIORITY_DEFAULT;
  }

  private async validateUploadedFile(urlStorage: string): Promise<void> {
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

    if (sizeBytes !== null && sizeBytes > this.maxVideoSizeBytes) {
      await this.storage.deleteObject(key).catch(() => undefined);
      const maxMb = Math.floor(this.maxVideoSizeBytes / (1024 * 1024));
      throw new BadRequestException(
        `Arquivo excede o tamanho maximo permitido (${maxMb} MB).`,
      );
    }
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

  private async assertCategoryOwned(accountId: string, categoriaId: string) {
    const category = await this.prisma.portfolioCategory.findFirst({
      where: { id: categoriaId, accountId },
      select: { id: true },
    });
    if (!category) {
      throw new BadRequestException(
        'categoriaId invalido ou nao pertence a esta conta',
      );
    }
  }

  private async assertClientOwned(accountId: string, clienteId: string) {
    const client = await this.prisma.client.findFirst({
      where: { id: clienteId, accountId },
      select: { id: true },
    });
    if (!client) {
      throw new BadRequestException(
        'clienteId invalido ou nao pertence a esta conta',
      );
    }
  }

  private async getOwnedPortfolio(accountId: string, id: string) {
    const portfolio = await this.prisma.portfolio.findFirst({
      where: { id, accountId },
      include: { videos: { orderBy: PORTFOLIO_VIDEOS_ORDER } },
    });
    if (!portfolio) {
      throw new NotFoundException('Portfolio nao encontrado');
    }
    return portfolio;
  }

  private async getOwnedPortfolioVideo(
    accountId: string,
    portfolioId: string,
    videoId: string,
  ): Promise<PortfolioVideo> {
    const video = await this.prisma.portfolioVideo.findFirst({
      where: { id: videoId, portfolioId, portfolio: { accountId } },
    });
    if (!video) {
      throw new NotFoundException('Video do portfolio nao encontrado');
    }
    return video;
  }

  private toVideoResponse(v: PortfolioVideo) {
    return {
      id: v.id,
      tipoMidia: v.tipoMidia,
      titulo: v.titulo,
      descricao: v.descricao,
      // Sempre a versao "pronta pra tocar": a otimizada quando ja existe,
      // senao o arquivo original. Null pra foto/design (a imagem em si vive em
      // posterUrl - ver uploadComplete).
      urlStorage: v.urlOtimizada ?? v.urlStorage,
      posterUrl: v.posterUrl,
      statusProcessamento: v.statusProcessamento,
      ordem: v.ordem,
      criadoEm: v.criadoEm,
    };
  }

  private toResponse(portfolio: {
    id: string;
    nome: string;
    descricao: string | null;
    linkPublico: string;
    capaUrl: string | null;
    categoriaId: string | null;
    clienteId: string | null;
    criadoEm: Date;
    atualizadoEm: Date;
    videos: PortfolioVideo[];
  }) {
    const videos = [...portfolio.videos].sort((a, b) => a.ordem - b.ordem);
    return {
      id: portfolio.id,
      nome: portfolio.nome,
      descricao: portfolio.descricao,
      linkPublico: portfolio.linkPublico,
      categoriaId: portfolio.categoriaId,
      clienteId: portfolio.clienteId,
      // Capa explicita quando setada (ver cover-upload-url); senao cai no
      // posterUrl do primeiro item, mesmo comportamento de antes do campo existir.
      capaUrl: portfolio.capaUrl ?? videos[0]?.posterUrl ?? null,
      videos: videos.map((v) => this.toVideoResponse(v)),
      criadoEm: portfolio.criadoEm,
      atualizadoEm: portfolio.atualizadoEm,
    };
  }

  private toSummary(portfolio: {
    id: string;
    nome: string;
    descricao: string | null;
    linkPublico: string;
    capaUrl: string | null;
    categoriaId: string | null;
    clienteId: string | null;
    criadoEm: Date;
    atualizadoEm: Date;
    videos: { posterUrl: string | null }[];
  }) {
    return {
      id: portfolio.id,
      nome: portfolio.nome,
      descricao: portfolio.descricao,
      linkPublico: portfolio.linkPublico,
      categoriaId: portfolio.categoriaId,
      clienteId: portfolio.clienteId,
      capaUrl: portfolio.capaUrl ?? portfolio.videos[0]?.posterUrl ?? null,
      criadoEm: portfolio.criadoEm,
      atualizadoEm: portfolio.atualizadoEm,
    };
  }
}

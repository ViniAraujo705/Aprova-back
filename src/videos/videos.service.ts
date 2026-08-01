import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole, VideoStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { createWithUniqueLinkPublico } from '../common/short-id.util';
import { StorageService } from '../storage/storage.service';
import { VideoProcessingService } from './processing/video-processing.service';
import { UploadUrlDto } from './dto/upload-url.dto';
import { CreateVideoDto } from './dto/create-video.dto';
import { NewVersionDto } from './dto/new-version.dto';
import { UpdateDeadlineDto } from './dto/update-deadline.dto';

const DEFAULT_MAX_VIDEO_SIZE_MB = 2048; // 2 GB

@Injectable()
export class VideosService {
  private readonly maxVideoSizeBytes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly processing: VideoProcessingService,
    config: ConfigService,
  ) {
    const maxMb =
      Number(config.get<string>('VIDEO_MAX_SIZE_MB')) ||
      DEFAULT_MAX_VIDEO_SIZE_MB;
    this.maxVideoSizeBytes = maxMb * 1024 * 1024;
  }

  createUploadUrl(dto: UploadUrlDto) {
    return this.storage.createPresignedUpload(dto.nomeArquivo, dto.contentType);
  }

  async create(accountId: string, dto: CreateVideoDto) {
    await this.assertProjectOwnership(accountId, dto.projectId);
    await this.validateUploadedFile(dto.urlStorage);

    // Se a versao nao for informada, calcula a proxima do projeto
    let versao = dto.versao;
    if (!versao) {
      const last = await this.prisma.video.findFirst({
        where: { projectId: dto.projectId },
        orderBy: { versao: 'desc' },
        select: { versao: true },
      });
      versao = last ? last.versao + 1 : 1;
    }

    const video = await createWithUniqueLinkPublico((linkPublico) =>
      this.prisma.video.create({
        data: {
          projectId: dto.projectId,
          urlStorage: dto.urlStorage,
          nomeArquivo: dto.nomeArquivo,
          versao,
          linkPublico,
          // status default = pendente (schema)
          // status_processamento default = processando (schema)
        },
      }),
    );

    // Dispara thumbnail + versão otimizada em background (não bloqueia a resposta)
    await this.processing.enqueue(video.id);

    return video;
  }

  /**
   * Cria uma nova versao referenciando o video pai (video_pai_id).
   * A nova versao herda o projeto, incrementa a versao e mantem o
   * historico: os comentarios/ratings da versao anterior permanecem
   * ligados ao video pai.
   */
  async createNewVersion(accountId: string, paiId: string, dto: NewVersionDto) {
    const pai = await this.getOwnedVideo(accountId, paiId);
    await this.validateUploadedFile(dto.urlStorage);

    const video = await createWithUniqueLinkPublico((linkPublico) =>
      this.prisma.video.create({
        data: {
          projectId: pai.projectId,
          urlStorage: dto.urlStorage,
          nomeArquivo: dto.nomeArquivo,
          versao: pai.versao + 1,
          videoPaiId: pai.id,
          linkPublico,
        },
      }),
    );

    await this.processing.enqueue(video.id);

    return video;
  }

  /**
   * Sem project_id, lista os videos de todos os projetos da conta (usado
   * pelo dashboard para evitar fan-out de uma request por projeto).
   */
  async findByProject(accountId: string, projectId?: string) {
    if (projectId) {
      await this.assertProjectOwnership(accountId, projectId);
    }
    return this.prisma.video.findMany({
      where: projectId ? { projectId } : { project: { accountId } },
      orderBy: { versao: 'desc' },
      include: {
        videoPai: {
          select: { id: true, versao: true, nomeArquivo: true },
        },
        _count: { select: { comments: true, ratings: true, versoes: true } },
      },
    });
  }

  async updateStatus(accountId: string, id: string, status: VideoStatus) {
    await this.getOwnedVideo(accountId, id);
    return this.prisma.video.update({
      where: { id },
      data: {
        status,
        ...(status === VideoStatus.aprovado ? { aprovadoEm: new Date() } : {}),
      },
    });
  }

  /**
   * Define/limpa o prazo de entrega (owner -> editor). Autorizacao de role
   * e feita no controller (RolesGuard); aqui so garante o isolamento por
   * conta, igual aos demais metodos.
   */
  async updateDeadline(accountId: string, id: string, dto: UpdateDeadlineDto) {
    await this.getOwnedVideo(accountId, id);
    return this.prisma.video.update({
      where: { id },
      data: { deadline: dto.deadline ? new Date(dto.deadline) : null },
    });
  }

  /**
   * Define/remove o editor (ou owner) responsavel pelo video. Alimenta o
   * desempenho da equipe (media de nota geral dos videos aprovados).
   */
  async updateEditorResponsavel(
    accountId: string,
    id: string,
    editorId: string | null,
  ) {
    await this.getOwnedVideo(accountId, id);

    if (editorId) {
      const membro = await this.prisma.user.findFirst({
        where: {
          id: editorId,
          accountId,
          role: { in: [UserRole.owner, UserRole.editor] },
        },
        select: { id: true },
      });
      if (!membro) {
        throw new BadRequestException(
          'editorId invalido ou nao pertence a esta conta',
        );
      }
    }

    return this.prisma.video.update({
      where: { id },
      data: { editorResponsavelId: editorId },
    });
  }

  /**
   * Exclui o video (comentarios/ratings caem em cascata via schema) e os
   * arquivos correspondentes no R2. Bloqueia com 409 se houver versoes
   * filhas (videoPaiId) apontando para este video, para nao orfanar
   * historico sem o owner decidir explicitamente. Diferente de
   * getOwnedVideo, aqui um video de outra conta responde 404 (nao 403)
   * para nao vazar a existencia do recurso para quem nao e dono dele.
   */
  async remove(accountId: string, id: string) {
    const video = await this.prisma.video.findFirst({
      where: { id, project: { accountId } },
      select: {
        id: true,
        urlStorage: true,
        urlOtimizada: true,
        thumbnailUrl: true,
        _count: { select: { versoes: true } },
      },
    });
    if (!video) {
      throw new NotFoundException('Video nao encontrado');
    }
    if (video._count.versoes > 0) {
      throw new ConflictException(
        'Video possui versoes vinculadas; remova ou mova as versoes antes de excluir',
      );
    }

    await this.prisma.video.delete({ where: { id } });

    await this.deleteStorageObjects([
      video.urlStorage,
      video.urlOtimizada,
      video.thumbnailUrl,
    ]);

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
   * Busca um video garantindo que ele pertence (via projeto) a conta.
   */
  private async getOwnedVideo(accountId: string, id: string) {
    const video = await this.prisma.video.findUnique({
      where: { id },
      include: { project: { select: { accountId: true } } },
    });
    if (!video) {
      throw new NotFoundException('Video nao encontrado');
    }
    if (video.project.accountId !== accountId) {
      throw new ForbiddenException('Video nao pertence a esta conta');
    }
    return video;
  }

  /**
   * Confirma que o PUT direto ao R2 realmente aconteceu (o cliente pode
   * reportar um urlStorage cujo upload falhou silenciosamente no browser)
   * e garante que o arquivo nao excede o tamanho maximo permitido. Falha
   * rapido aqui em vez de deixar o worker descobrir isso depois de gastar
   * os retries do BullMQ.
   */
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

  private async assertProjectOwnership(accountId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, accountId },
      select: { id: true },
    });
    if (!project) {
      throw new NotFoundException(
        'Projeto nao encontrado ou nao pertence a esta conta',
      );
    }
  }
}

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole, VideoStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { createWithUniqueLinkPublico } from '../common/short-id.util';
import { StorageService } from '../storage/storage.service';
import { VideoProcessingService } from './processing/video-processing.service';
import { UploadUrlDto } from './dto/upload-url.dto';
import { CreateVideoDto } from './dto/create-video.dto';
import { NewVersionDto } from './dto/new-version.dto';
import { UpdateDeadlineDto } from './dto/update-deadline.dto';

@Injectable()
export class VideosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly processing: VideoProcessingService,
  ) {}

  createUploadUrl(dto: UploadUrlDto) {
    return this.storage.createPresignedUpload(dto.nomeArquivo, dto.contentType);
  }

  async create(accountId: string, dto: CreateVideoDto) {
    await this.assertProjectOwnership(accountId, dto.projectId);

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

  async findByProject(accountId: string, projectId: string) {
    await this.assertProjectOwnership(accountId, projectId);
    return this.prisma.video.findMany({
      where: { projectId },
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

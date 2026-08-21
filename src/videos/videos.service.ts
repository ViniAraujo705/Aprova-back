import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ClientActivityAtorTipo,
  ClientActivityType,
  EtapaProducao,
  Prisma,
  UserRole,
  UserStatus,
  VideoStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { createWithUniqueLinkPublico } from '../common/short-id.util';
import { assertProjectAccess } from '../common/project-access.util';
import { AuthUser } from '../auth/decorators/current-user.decorator';
import { StorageService } from '../storage/storage.service';
import { PlansService } from '../plans/plans.service';
import { ClientActivityService } from '../client-activity/client-activity.service';
import { VideoProcessingService } from './processing/video-processing.service';
import {
  VIDEO_PROCESSING_PRIORITY_DEFAULT,
  VIDEO_PROCESSING_PRIORITY_HIGH,
} from './processing/video-processing.constants';
import { UploadUrlDto } from './dto/upload-url.dto';
import { CreateVideoDto } from './dto/create-video.dto';
import { NewVersionDto } from './dto/new-version.dto';
import { UpdateDeadlineDto } from './dto/update-deadline.dto';
import { UpdateTituloDto } from './dto/update-titulo.dto';
import { UpdateKanbanMetadataDto } from './dto/update-kanban-metadata.dto';

const DEFAULT_MAX_VIDEO_SIZE_MB = 2048; // 2 GB

const KANBAN_RELATIONS = {
  labels: { select: { labelId: true } },
  collaborators: { select: { userId: true } },
  responsaveis: { select: { userId: true } },
} as const;

function toVideoDto<
  T extends {
    labels: { labelId: string }[];
    collaborators: { userId: string }[];
    responsaveis: { userId: string }[];
  },
>(video: T) {
  const { labels, collaborators, responsaveis, ...rest } = video;
  return {
    ...rest,
    labelIds: labels.map((label) => label.labelId),
    collaboratorIds: collaborators.map((collaborator) => collaborator.userId),
    editorIds: responsaveis.map((responsavel) => responsavel.userId),
  };
}

@Injectable()
export class VideosService {
  private readonly maxVideoSizeBytes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly processing: VideoProcessingService,
    private readonly plans: PlansService,
    private readonly clientActivity: ClientActivityService,
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

  async create(accountId: string, dto: CreateVideoDto, user: AuthUser) {
    const project = await this.assertProjectOwnership(
      accountId,
      dto.projectId,
      user,
    );
    await this.plans.assertCanCreateVideo(accountId);
    await this.validateUploadedFile(dto.urlStorage);
    await this.assertKanbanRefsBelongToAccount(
      accountId,
      dto.labelIds,
      dto.collaboratorIds,
    );

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
          ...(dto.labelIds
            ? {
                labels: {
                  create: dto.labelIds.map((labelId) => ({ labelId })),
                },
              }
            : {}),
          ...(dto.collaboratorIds
            ? {
                collaborators: {
                  create: dto.collaboratorIds.map((userId) => ({ userId })),
                },
              }
            : {}),
          // status default = pendente (schema)
          // status_processamento default = processando (schema)
        },
        include: KANBAN_RELATIONS,
      }),
    );

    // Dispara thumbnail + versão otimizada em background (não bloqueia a resposta)
    await this.processing.enqueue(
      'video',
      video.id,
      await this.processingPriority(accountId),
    );

    await this.clientActivity.log({
      accountId,
      clienteId: project.clientId,
      tipo: ClientActivityType.video_enviado,
      atorTipo:
        user.role === UserRole.owner
          ? ClientActivityAtorTipo.owner
          : ClientActivityAtorTipo.editor,
      atorNome: user.nome,
      videoId: video.id,
      projectId: dto.projectId,
      descricao: video.nomeArquivo,
    });

    return toVideoDto(video);
  }

  /**
   * Cria uma nova versao referenciando o video pai (video_pai_id).
   * A nova versao herda o projeto, incrementa a versao e mantem o
   * historico: os comentarios/ratings da versao anterior permanecem
   * ligados ao video pai.
   */
  async createNewVersion(
    accountId: string,
    paiId: string,
    dto: NewVersionDto,
    user: AuthUser,
  ) {
    const pai = await this.getOwnedVideo(accountId, paiId, user);
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
        include: KANBAN_RELATIONS,
      }),
    );

    await this.processing.enqueue(
      'video',
      video.id,
      await this.processingPriority(accountId),
    );

    await this.clientActivity.log({
      accountId,
      clienteId: pai.project.clientId,
      tipo: ClientActivityType.nova_versao,
      atorTipo:
        user.role === UserRole.owner
          ? ClientActivityAtorTipo.owner
          : ClientActivityAtorTipo.editor,
      atorNome: user.nome,
      videoId: video.id,
      projectId: pai.projectId,
      descricao: video.nomeArquivo,
    });

    return toVideoDto(video);
  }

  /**
   * Sem project_id, lista os videos de todos os projetos da conta (usado
   * pelo dashboard para evitar fan-out de uma request por projeto).
   * Paginado: sem isso, contas com muitos videos acumulados carregavam a
   * lista inteira numa unica query/payload.
   */
  async findByProject(
    accountId: string,
    projectId: string | undefined,
    page = 1,
    limit = 50,
    user: AuthUser,
  ) {
    if (projectId) {
      await this.assertProjectOwnership(accountId, projectId, user);
    }
    const where = projectId
      ? { projectId }
      : {
          project: {
            accountId,
            ...(user.role === UserRole.editor
              ? { members: { some: { userId: user.id } } }
              : {}),
          },
        };
    // orderBy versao/id garante paginacao deterministica (versao sozinha
    // tem empates entre familias de video diferentes)
    const orderBy: Prisma.VideoOrderByWithRelationInput[] = [
      { versao: 'desc' },
      { id: 'asc' },
    ];

    const [data, total] = await Promise.all([
      this.prisma.video.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          ...KANBAN_RELATIONS,
          videoPai: {
            select: { id: true, versao: true, nomeArquivo: true },
          },
          _count: {
            select: { comments: true, ratings: true, versoes: true },
          },
        },
      }),
      this.prisma.video.count({ where }),
    ]);

    return {
      data: data.map(toVideoDto),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async updateStatus(
    accountId: string,
    id: string,
    status: VideoStatus,
    user: AuthUser,
  ) {
    await this.getOwnedVideo(accountId, id, user);
    const video = await this.prisma.video.update({
      where: { id },
      data: {
        status,
        ...(status === VideoStatus.aprovado ? { aprovadoEm: new Date() } : {}),
      },
      include: KANBAN_RELATIONS,
    });
    return toVideoDto(video);
  }

  /**
   * Etapa de producao interna do board Kanban - independente do
   * VideoStatus (decisao do cliente na tela publica).
   */
  async updateEtapa(
    accountId: string,
    id: string,
    etapa: EtapaProducao,
    user: AuthUser,
  ) {
    await this.getOwnedVideo(accountId, id, user);
    const video = await this.prisma.video.update({
      where: { id },
      data: { etapaProducao: etapa },
      include: KANBAN_RELATIONS,
    });
    return toVideoDto(video);
  }

  /**
   * Define/limpa o prazo de entrega (owner -> editor). Autorizacao de role
   * e feita no controller (RolesGuard); aqui so garante o isolamento por
   * conta, igual aos demais metodos.
   */
  async updateDeadline(
    accountId: string,
    id: string,
    dto: UpdateDeadlineDto,
    user: AuthUser,
  ) {
    await this.getOwnedVideo(accountId, id, user);
    const video = await this.prisma.video.update({
      where: { id },
      data: { deadline: dto.deadline ? new Date(dto.deadline) : null },
      include: KANBAN_RELATIONS,
    });
    return toVideoDto(video);
  }

  async updateTitulo(
    accountId: string,
    id: string,
    dto: UpdateTituloDto,
    user: AuthUser,
  ) {
    await this.getOwnedVideo(accountId, id, user);
    const video = await this.prisma.video.update({
      where: { id },
      data: { nomeArquivo: dto.nomeArquivo },
      include: KANBAN_RELATIONS,
    });
    return toVideoDto(video);
  }

  /**
   * Substitui a lista de pessoas (owner ou editor) responsaveis pelo video.
   * Uma lista vazia remove todas as atribuicoes. Cada responsavel recebe
   * credito integral no desempenho da equipe.
   */
  async updateEditorResponsavel(
    accountId: string,
    id: string,
    editorIds: string[],
    user: AuthUser,
  ) {
    await this.getOwnedVideo(accountId, id, user);

    if (editorIds.length > 0) {
      const membrosValidos = await this.prisma.membership.count({
        where: {
          userId: { in: editorIds },
          accountId,
          role: { in: [UserRole.owner, UserRole.editor] },
        },
      });
      if (membrosValidos !== editorIds.length) {
        throw new BadRequestException(
          'editorIds contem membro invalido ou que nao pertence a esta conta',
        );
      }
    }

    const video = await this.prisma.video.update({
      where: { id },
      data: {
        responsaveis: {
          deleteMany: {},
          create: editorIds.map((userId) => ({ userId })),
        },
      },
      include: KANBAN_RELATIONS,
    });
    return toVideoDto(video);
  }

  async updateKanbanMetadata(
    accountId: string,
    id: string,
    dto: UpdateKanbanMetadataDto,
    user: AuthUser,
  ) {
    await this.getOwnedVideo(accountId, id, user);
    await this.assertKanbanRefsBelongToAccount(
      accountId,
      dto.labelIds,
      dto.collaboratorIds,
    );

    const video = await this.prisma.video.update({
      where: { id },
      data: {
        ...(dto.labelIds !== undefined
          ? {
              labels: {
                deleteMany: {},
                create: dto.labelIds.map((labelId) => ({ labelId })),
              },
            }
          : {}),
        ...(dto.collaboratorIds !== undefined
          ? {
              collaborators: {
                deleteMany: {},
                create: dto.collaboratorIds.map((userId) => ({ userId })),
              },
            }
          : {}),
      },
      include: KANBAN_RELATIONS,
    });
    return toVideoDto(video);
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

  /** Contas com prioridade de processamento no plano processam antes das demais na fila. */
  private async processingPriority(accountId: string): Promise<number> {
    const plan = await this.plans.getPlan(accountId);
    return this.plans.limitsFor(plan).priorityProcessing
      ? VIDEO_PROCESSING_PRIORITY_HIGH
      : VIDEO_PROCESSING_PRIORITY_DEFAULT;
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
  private async getOwnedVideo(accountId: string, id: string, user: AuthUser) {
    const video = await this.prisma.video.findUnique({
      where: { id },
      include: { project: { select: { accountId: true, clientId: true } } },
    });
    if (!video) {
      throw new NotFoundException('Video nao encontrado');
    }
    if (video.project.accountId !== accountId) {
      throw new ForbiddenException('Video nao pertence a esta conta');
    }
    await assertProjectAccess(this.prisma, video.projectId, user);
    return video;
  }

  /** Confirma que labels e membros informativos pertencem a esta agencia. */
  private async assertKanbanRefsBelongToAccount(
    accountId: string,
    labelIds?: string[],
    collaboratorIds?: string[],
  ): Promise<void> {
    const checks: Promise<void>[] = [];
    if (labelIds && labelIds.length > 0) {
      checks.push(
        this.prisma.label
          .count({ where: { accountId, id: { in: labelIds } } })
          .then((count) => {
            if (count !== labelIds.length) {
              throw new BadRequestException(
                'labelIds contem label invalida ou de outra conta',
              );
            }
          }),
      );
    }
    if (collaboratorIds && collaboratorIds.length > 0) {
      checks.push(
        this.prisma.membership
          .count({
            where: {
              accountId,
              userId: { in: collaboratorIds },
              role: { in: [UserRole.owner, UserRole.editor] },
              status: UserStatus.ativo,
            },
          })
          .then((count) => {
            if (count !== collaboratorIds.length) {
              throw new BadRequestException(
                'collaboratorIds contem membro invalido ou de outra conta',
              );
            }
          }),
      );
    }
    await Promise.all(checks);
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

  private async assertProjectOwnership(
    accountId: string,
    projectId: string,
    user: AuthUser,
  ) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, accountId },
      select: { id: true, clientId: true },
    });
    if (!project) {
      throw new NotFoundException(
        'Projeto nao encontrado ou nao pertence a esta conta',
      );
    }
    await assertProjectAccess(this.prisma, projectId, user);
    return project;
  }
}

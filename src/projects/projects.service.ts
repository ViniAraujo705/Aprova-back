import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole, VideoStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { createWithUniqueLinkPublico } from '../common/short-id.util';
import { assertProjectAccess } from '../common/project-access.util';
import { AuthUser } from '../auth/decorators/current-user.decorator';
import { StorageService } from '../storage/storage.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectPhotoUploadUrlDto } from './dto/project-photo-upload-url.dto';

const MEMBER_SELECT = {
  id: true,
  userId: true,
  user: { select: { id: true, nome: true, email: true } },
} as const;

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async create(accountId: string, dto: CreateProjectDto, user: AuthUser) {
    if (dto.clientId) {
      await this.assertClientOwnership(accountId, dto.clientId);
    }
    const contatoAvulso = dto.contatoAvulso?.trim() || null;
    return createWithUniqueLinkPublico((linkPublico) =>
      this.prisma.project.create({
        data: {
          nome: dto.nome,
          clientId: dto.clientId ?? null,
          // So faz sentido sem cliente: com cliente o nome vem do cadastro.
          contatoAvulso: dto.clientId ? null : contatoAvulso,
          fotoUrl: dto.fotoUrl ?? null,
          accountId,
          linkPublico,
          // Um editor só acessa projetos nos quais consta em ProjectMember.
          // Ao criar o projeto, ele precisa receber esse vínculo para poder
          // vê-lo e enviar o primeiro vídeo imediatamente em seguida.
          ...(user.role === UserRole.editor
            ? { members: { create: { userId: user.id } } }
            : {}),
        },
      }),
    );
  }

  /**
   * Owner ve todos os projetos da conta. Editor so ve projetos onde foi
   * atribuido via ProjectMember (ver assertProjectAccess).
   */
  findAll(accountId: string, user: AuthUser) {
    return this.prisma.project.findMany({
      where: {
        accountId,
        ...(user.role === UserRole.editor
          ? { members: { some: { userId: user.id } } }
          : {}),
      },
      orderBy: { criadoEm: 'desc' },
      include: { client: { select: { id: true, nome: true } } },
    });
  }

  async findOne(accountId: string, id: string, user: AuthUser) {
    const project = await this.prisma.project.findFirst({
      where: { id, accountId },
      include: {
        client: { select: { id: true, nome: true } },
        members: { select: MEMBER_SELECT },
      },
    });
    if (!project) {
      throw new NotFoundException('Projeto nao encontrado');
    }
    await assertProjectAccess(this.prisma, id, user);
    return project;
  }

  async update(
    accountId: string,
    id: string,
    dto: UpdateProjectDto,
    user: AuthUser,
  ) {
    await this.findOne(accountId, id, user);
    if (dto.clientId) {
      await this.assertClientOwnership(accountId, dto.clientId);
    }
    return this.prisma.project.update({
      where: { id },
      data: dto,
    });
  }

  /**
   * Resumo do que "liberar armazenamento" apagaria: quantos arquivos e
   * quantos bytes, e se o projeto ja pode (todas as entregas aprovadas).
   * Alimenta a confirmacao do front antes da exclusao definitiva.
   */
  async storageSummary(accountId: string, id: string, user: AuthUser) {
    await this.findOne(accountId, id, user);
    const plan = await this.releasePlan(id);
    const sizes = await Promise.all(
      plan.keys.map((key) =>
        this.storage
          .headObject(key)
          .then((head) => head.sizeBytes ?? 0)
          .catch(() => 0),
      ),
    );
    return {
      liberavel: plan.motivo === null,
      motivo: plan.motivo,
      videos: plan.videoIds.length,
      arquivos: plan.keys.length,
      bytes: sizes.reduce((total, size) => total + size, 0),
      liberadoEm: plan.liberadoEm,
    };
  }

  /**
   * Apaga do R2 o original e a copia otimizada de todos os videos (todas as
   * versoes) de um projeto aprovado. Definitivo. As linhas de Video ficam -
   * comentarios, notas, historico e relatorios continuam valendo - e so
   * ganham `arquivoRemovidoEm`. A thumbnail e mantida para o projeto seguir
   * reconhecivel. Arquivo ainda usado por um item de portfolio nao e
   * apagado (o portfolio guarda uma copia da URL, nao do arquivo).
   */
  async releaseStorage(accountId: string, id: string, user: AuthUser) {
    await this.findOne(accountId, id, user);
    const plan = await this.releasePlan(id);
    if (plan.motivo) {
      throw new ConflictException(plan.motivo);
    }

    const sizes = await Promise.all(
      plan.keys.map((key) =>
        this.storage
          .headObject(key)
          .then((head) => head.sizeBytes ?? 0)
          .catch(() => 0),
      ),
    );

    // Marca antes de apagar: se o R2 falhar no meio, o pior caso e um
    // objeto orfao no bucket, nunca um video "ativo" apontando pro nada.
    const agora = new Date();
    await this.prisma.video.updateMany({
      where: { id: { in: plan.videoIds } },
      data: { arquivoRemovidoEm: agora, urlOtimizada: null },
    });
    await Promise.all(
      plan.keys.map((key) =>
        this.storage.deleteObject(key).catch(() => undefined),
      ),
    );

    return {
      liberadoEm: agora,
      videos: plan.videoIds.length,
      arquivos: plan.keys.length,
      bytes: sizes.reduce((total, size) => total + size, 0),
    };
  }

  private async releasePlan(projectId: string) {
    const videos = await this.prisma.video.findMany({
      where: { projectId },
      select: {
        id: true,
        videoPaiId: true,
        status: true,
        urlStorage: true,
        urlOtimizada: true,
        arquivoRemovidoEm: true,
      },
    });
    const parents = new Set(
      videos.map((v) => v.videoPaiId).filter((v): v is string => !!v),
    );
    // Ponta de cada cadeia de versoes = a entrega que o cliente aprova.
    const latest = videos.filter((v) => !parents.has(v.id));
    const pendentes = videos.filter((v) => !v.arquivoRemovidoEm);
    const liberadoEm = videos.length
      ? videos.reduce<Date | null>(
          (acc, v) =>
            !v.arquivoRemovidoEm
              ? acc
              : acc && acc > v.arquivoRemovidoEm
                ? acc
                : v.arquivoRemovidoEm,
          null,
        )
      : null;

    let motivo: string | null = null;
    if (latest.length === 0) {
      motivo = 'O projeto ainda nao tem videos';
    } else if (latest.some((v) => v.status !== VideoStatus.aprovado)) {
      motivo = 'So da para liberar quando todos os videos estiverem aprovados';
    } else if (pendentes.length === 0) {
      motivo = 'O armazenamento deste projeto ja foi liberado';
    }

    const urls = pendentes
      .flatMap((v) => [v.urlStorage, v.urlOtimizada])
      .filter((url): url is string => !!url);
    const usadasNoPortfolio = urls.length
      ? await this.prisma.portfolioVideo.findMany({
          where: {
            OR: [{ urlStorage: { in: urls } }, { urlOtimizada: { in: urls } }],
          },
          select: { urlStorage: true, urlOtimizada: true },
        })
      : [];
    const protegidas = new Set(
      usadasNoPortfolio.flatMap((p) => [p.urlStorage, p.urlOtimizada]),
    );
    const keys = [
      ...new Set(
        urls
          .filter((url) => !protegidas.has(url))
          .map((url) => this.storage.keyFromPublicUrl(url))
          .filter((key): key is string => !!key),
      ),
    ];

    return {
      motivo,
      videoIds: pendentes.map((v) => v.id),
      keys,
      liberadoEm,
    };
  }

  async remove(accountId: string, id: string, user: AuthUser) {
    await this.findOne(accountId, id, user);
    await this.prisma.project.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * Atribui um editor (ou owner) ao projeto. Idempotente: atribuir de novo
   * quem ja e membro nao gera erro nem duplicata (constraint unique).
   */
  async addMember(accountId: string, projectId: string, memberId: string) {
    await this.assertProjectInAccount(accountId, projectId);
    const membro = await this.prisma.membership.findFirst({
      where: {
        userId: memberId,
        accountId,
        role: { in: [UserRole.owner, UserRole.editor] },
      },
      select: { userId: true },
    });
    if (!membro) {
      throw new BadRequestException(
        'Membro invalido ou nao pertence a esta conta',
      );
    }

    await this.prisma.projectMember.upsert({
      where: { projectId_userId: { projectId, userId: memberId } },
      create: { projectId, userId: memberId },
      update: {},
    });
    return this.prisma.projectMember.findMany({
      where: { projectId },
      select: MEMBER_SELECT,
    });
  }

  async removeMember(accountId: string, projectId: string, memberId: string) {
    await this.assertProjectInAccount(accountId, projectId);
    await this.prisma.projectMember.deleteMany({
      where: { projectId, userId: memberId },
    });
    return this.prisma.projectMember.findMany({
      where: { projectId },
      select: MEMBER_SELECT,
    });
  }

  /**
   * Presigned URL para a miniatura do projeto (mesmo contrato de 2 passos do
   * upload de foto do cliente: PUT direto no R2 e depois
   * PATCH /projects/:id { fotoUrl: publicUrl }). Diferente da rota do
   * cliente, aqui o :id e conferido de verdade - passa pelo findOne, entao
   * um editor so gera URL para projeto ao qual foi atribuido.
   */
  async createPhotoUploadUrl(
    accountId: string,
    id: string,
    dto: ProjectPhotoUploadUrlDto,
    user: AuthUser,
  ) {
    await this.findOne(accountId, id, user);
    return this.storage.createPresignedUploadIn(
      'projects',
      dto.nomeArquivo,
      dto.contentType,
    );
  }

  private async assertProjectInAccount(accountId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, accountId },
      select: { id: true },
    });
    if (!project) {
      throw new NotFoundException('Projeto nao encontrado');
    }
  }

  private async assertClientOwnership(accountId: string, clientId: string) {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, accountId },
    });
    if (!client) {
      throw new BadRequestException(
        'Cliente nao encontrado ou nao pertence a esta conta',
      );
    }
  }
}

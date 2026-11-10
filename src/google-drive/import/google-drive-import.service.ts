import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { PlansService } from '../../plans/plans.service';
import { assertProjectAccess } from '../../common/project-access.util';
import { AuthUser } from '../../auth/decorators/current-user.decorator';
import {
  DRIVE_SCOPE_MESSAGE,
  GoogleDriveOAuthService,
} from '../google-drive-oauth.service';
import { ImportGoogleDriveFileDto } from '../dto/import-google-drive-file.dto';
import {
  GOOGLE_DRIVE_IMPORT_JOB,
  GOOGLE_DRIVE_IMPORT_QUEUE,
  GoogleDriveImportJobData,
  GoogleDriveImportJobResult,
  IMPORTABLE_MIME_TYPES,
} from './google-drive-import.constants';

const DEFAULT_MAX_VIDEO_SIZE_MB = 2048; // mesmo teto do upload direto

export type GoogleDriveImportStatus =
  'na_fila' | 'importando' | 'concluido' | 'erro';

/**
 * Importa um arquivo do Google Drive como video de aprovacao, servidor a
 * servidor (Drive -> R2), sem o arquivo passar pelo navegador.
 *
 * `start` valida tudo o que da pra validar na hora (projeto, limite do
 * plano, tipo, tamanho, permissao do token) e enfileira; o download/upload
 * roda no `GoogleDriveImportProcessor`, que no fim registra o video pelo
 * MESMO `VideosService.create` do upload normal (thumbnail, versao
 * otimizada, link publico, atividade do cliente, limite do plano).
 * `status` e consultado pelo front ate concluir.
 */
@Injectable()
export class GoogleDriveImportService {
  private readonly logger = new Logger(GoogleDriveImportService.name);
  private readonly maxSizeBytes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlansService,
    private readonly oauth: GoogleDriveOAuthService,
    @InjectQueue(GOOGLE_DRIVE_IMPORT_QUEUE)
    private readonly queue: Queue<
      GoogleDriveImportJobData,
      GoogleDriveImportJobResult
    >,
    config: ConfigService,
  ) {
    const maxMb =
      Number(config.get<string>('VIDEO_MAX_SIZE_MB')) ||
      DEFAULT_MAX_VIDEO_SIZE_MB;
    this.maxSizeBytes = maxMb * 1024 * 1024;
  }

  async start(user: AuthUser, dto: ImportGoogleDriveFileDto) {
    const project = await this.prisma.project.findFirst({
      where: { id: dto.projectId, accountId: user.accountId },
      select: { id: true },
    });
    if (!project) {
      throw new NotFoundException(
        'Projeto nao encontrado ou nao pertence a esta conta',
      );
    }
    await assertProjectAccess(this.prisma, dto.projectId, user);
    // Falha rapido; o create no fim do job confere de novo (o limite pode
    // ter sido atingido enquanto o arquivo baixava).
    await this.plans.assertCanCreateVideo(user.accountId);

    const accessToken = await this.accessTokenFor(user.id);
    if (!(await this.oauth.hasReadScope(accessToken))) {
      throw new ConflictException(DRIVE_SCOPE_MESSAGE);
    }
    const item = await this.oauth.getItem(accessToken, dto.googleFileId);
    if (item.isFolder) {
      throw new BadRequestException(
        'Escolha um arquivo de video, nao uma pasta.',
      );
    }
    if (!(IMPORTABLE_MIME_TYPES as readonly string[]).includes(item.mimeType)) {
      throw new BadRequestException(
        `"${item.name}" nao e um video suportado (MP4, MOV, WEBM, AVI ou MPEG).`,
      );
    }
    if (item.sizeBytes !== null && item.sizeBytes > this.maxSizeBytes) {
      const maxMb = Math.floor(this.maxSizeBytes / (1024 * 1024));
      throw new BadRequestException(
        `"${item.name}" excede o tamanho maximo permitido (${maxMb} MB).`,
      );
    }

    const importId = randomUUID();
    const nomeArquivo = dto.nomeArquivo?.trim() || item.name;
    try {
      await this.queue.add(
        GOOGLE_DRIVE_IMPORT_JOB,
        {
          accountId: user.accountId,
          user,
          projectId: dto.projectId,
          googleFileId: item.id,
          nomeArquivo,
          mimeType: item.mimeType,
          sizeBytes: item.sizeBytes,
        },
        {
          jobId: importId,
          // Sem retry automatico: uma segunda tentativa depois do create
          // duplicaria o video. Falhou, o front oferece "tentar de novo".
          attempts: 1,
          // Guardado um tempo pro front consultar o desfecho.
          removeOnComplete: { age: 60 * 60 * 6 },
          removeOnFail: { age: 60 * 60 * 24 },
        },
      );
    } catch (err) {
      this.logger.error(
        `Nao foi possivel enfileirar import do Drive: ${(err as Error).message}`,
      );
      throw new ServiceUnavailableException(
        'Fila de importacao indisponivel. Tente novamente em instantes.',
      );
    }

    return {
      importId,
      status: 'na_fila' as GoogleDriveImportStatus,
      nomeArquivo,
      sizeBytes: item.sizeBytes,
    };
  }

  async status(user: AuthUser, importId: string) {
    const job = await this.queue.getJob(importId);
    // Job de outra conta responde igual a inexistente.
    if (!job || job.data.accountId !== user.accountId) {
      throw new NotFoundException('Importacao nao encontrada');
    }
    const state = await job.getState();
    const progress = typeof job.progress === 'number' ? job.progress : 0;
    let status: GoogleDriveImportStatus;
    if (state === 'completed') status = 'concluido';
    else if (state === 'failed') status = 'erro';
    else if (state === 'active') status = 'importando';
    else status = 'na_fila';

    return {
      importId,
      status,
      progresso: status === 'concluido' ? 100 : Math.round(progress),
      nomeArquivo: job.data.nomeArquivo,
      sizeBytes: job.data.sizeBytes,
      videoId:
        status === 'concluido' ? (job.returnvalue?.videoId ?? null) : null,
      erro:
        status === 'erro'
          ? job.failedReason || 'Falha ao importar do Google Drive'
          : null,
    };
  }

  /** Token de acesso valido da conexao PESSOAL do usuario. */
  async accessTokenFor(userId: string): Promise<string> {
    const connection = await this.prisma.googleDriveConnection.findUnique({
      where: { userId },
      select: { refreshTokenEnc: true },
    });
    if (!connection) {
      throw new BadRequestException(
        'Conecte o Google Drive antes de importar arquivos',
      );
    }
    return this.oauth.getValidAccessToken(connection.refreshTokenEnc);
  }
}

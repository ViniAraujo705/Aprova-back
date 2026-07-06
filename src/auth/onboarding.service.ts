import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RatingCategory, ProcessamentoStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// Asset de demonstração fixo no R2 (configurável). Se não houver URL
// configurada, usa um placeholder — o importante é o usuário ver o
// produto populado logo após o cadastro.
const DEFAULT_DEMO_VIDEO_URL =
  'https://demo.aprova.app/exemplo/video-exemplo.mp4';
const DEFAULT_DEMO_THUMB_URL =
  'https://demo.aprova.app/exemplo/video-exemplo.jpg';

/**
 * Popula dados de exemplo logo após o cadastro, para o usuário já ver o
 * produto com conteúdo. As entidades criadas são marcadas com is_exemplo
 * para o frontend identificar e o usuário poder deletá-las facilmente.
 */
@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Cria 1 cliente, 1 projeto e 1 vídeo de exemplo (com comentários e
   * ratings fake). Pensado para rodar em background: nunca lança para o
   * fluxo de cadastro — apenas registra o erro se falhar.
   */
  async seedExampleData(accountId: string): Promise<void> {
    try {
      const demoVideoUrl =
        this.config.get<string>('DEMO_VIDEO_URL') ?? DEFAULT_DEMO_VIDEO_URL;
      const demoThumbUrl =
        this.config.get<string>('DEMO_THUMBNAIL_URL') ?? DEFAULT_DEMO_THUMB_URL;

      const client = await this.prisma.client.create({
        data: {
          nome: 'Cliente Exemplo',
          email: 'cliente.exemplo@aprova.app',
          accountId,
          isExemplo: true,
        },
      });

      const project = await this.prisma.project.create({
        data: {
          nome: 'Projeto Exemplo',
          clientId: client.id,
          accountId,
          isExemplo: true,
        },
      });

      await this.prisma.video.create({
        data: {
          projectId: project.id,
          urlStorage: demoVideoUrl,
          nomeArquivo: 'video-exemplo.mp4',
          versao: 1,
          isExemplo: true,
          // O asset de demo já vem pronto — não precisa passar pelo worker
          thumbnailUrl: demoThumbUrl,
          urlOtimizada: demoVideoUrl,
          statusProcessamento: ProcessamentoStatus.pronto,
          comments: {
            create: [
              {
                timestampVideo: 3,
                texto: 'Curti a abertura! Podemos deixar a logo um pouco maior?',
                autorNome: 'Cliente Exemplo',
              },
              {
                timestampVideo: 12,
                texto: 'O áudio ficou ótimo aqui.',
                autorNome: 'Cliente Exemplo',
              },
            ],
          },
          ratings: {
            create: [
              { categoria: RatingCategory.iluminacao, nota: 5 },
              { categoria: RatingCategory.audio, nota: 4 },
              { categoria: RatingCategory.enquadramento, nota: 5 },
            ],
          },
        },
      });

      this.logger.log(`Dados de exemplo criados para a conta ${accountId}.`);
    } catch (err) {
      this.logger.error(
        `Falha ao criar dados de exemplo para a conta ${accountId}: ${
          (err as Error).message
        }`,
      );
    }
  }
}

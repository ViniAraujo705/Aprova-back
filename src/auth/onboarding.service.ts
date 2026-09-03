import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProcessamentoStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { createWithUniqueLinkPublico } from '../common/short-id.util';

// Asset de demonstração fixo no R2 (configurável). Se não houver URL
// configurada, usa um placeholder — o importante é o usuário ver o
// produto populado logo após o cadastro.
const DEFAULT_DEMO_VIDEO_URL =
  'https://demo.checkprod.com.br/exemplo/video-exemplo.mp4';
const DEFAULT_DEMO_THUMB_URL =
  'https://demo.checkprod.com.br/exemplo/video-exemplo.jpg';

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
          email: 'cliente.exemplo@checkprod.com.br',
          accountId,
          isExemplo: true,
        },
      });

      const project = await createWithUniqueLinkPublico((linkPublico) =>
        this.prisma.project.create({
          data: {
            nome: 'Projeto Exemplo',
            clientId: client.id,
            accountId,
            isExemplo: true,
            linkPublico,
          },
        }),
      );

      // As 3 perguntas de avaliacao padrao ja foram criadas junto da conta
      // (ver AuthService.register) - reaproveita os ids pros ratings fake.
      const ratingQuestions = await this.prisma.ratingQuestion.findMany({
        where: { accountId },
        orderBy: { ordem: 'asc' },
        take: 3,
        select: { id: true },
      });
      const notasFake = [5, 4, 5];

      await createWithUniqueLinkPublico((linkPublico) =>
        this.prisma.video.create({
          data: {
            projectId: project.id,
            urlStorage: demoVideoUrl,
            nomeArquivo: 'video-exemplo.mp4',
            versao: 1,
            isExemplo: true,
            linkPublico,
            // O asset de demo já vem pronto — não precisa passar pelo worker
            thumbnailUrl: demoThumbUrl,
            urlOtimizada: demoVideoUrl,
            statusProcessamento: ProcessamentoStatus.pronto,
            comments: {
              create: [
                {
                  timestampVideo: 3,
                  texto:
                    'Curti a abertura! Podemos deixar a logo um pouco maior?',
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
              create: ratingQuestions.map((q, i) => ({
                ratingQuestionId: q.id,
                nota: notasFake[i] ?? 5,
              })),
            },
          },
        }),
      );

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

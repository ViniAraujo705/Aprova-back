import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CommentAuthorType,
  CommentChannel,
  EtapaProducao,
  NotificationType,
  PortfolioMediaType,
  UserRole,
  VideoStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StorageService } from '../storage/storage.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CreateRatingDto } from './dto/create-rating.dto';
import { ApproveVideoDto } from './dto/approve-video.dto';
import { AudioUploadUrlDto } from './dto/audio-upload-url.dto';
import { UpdateTituloDto } from './dto/update-titulo.dto';

@Injectable()
export class PublicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Galeria publica do projeto: lista todos os videos de uma vez a partir
   * de um unico link (link_publico do Project), para o cliente nao precisar
   * entrar video por video. Cada item aponta pro link_publico do video, que
   * continua sendo o ponto de entrada do player/aprovacao/comentarios.
   */
  async getProject(linkPublico: string) {
    const project = await this.prisma.project.findUnique({
      where: { linkPublico },
      select: {
        nome: true,
        client: {
          select: { nome: true, logoUrl: true, corDestaque: true },
        },
        account: {
          select: {
            nomeAgencia: true,
            memberships: {
              where: { role: UserRole.owner },
              select: { user: { select: { logoUrl: true, corDestaque: true } } },
              orderBy: { criadoEm: 'asc' },
              take: 1,
            },
          },
        },
        videos: {
          orderBy: { criadoEm: 'asc' },
          select: {
            id: true,
            videoPaiId: true,
            linkPublico: true,
            nomeArquivo: true,
            thumbnailUrl: true,
            status: true,
            statusProcessamento: true,
            versao: true,
          },
        },
      },
    });
    if (!project) {
      throw new NotFoundException('Projeto nao encontrado');
    }

    return {
      projeto: { nome: project.nome },
      // Marca propria do cliente (branding), quando configurada (ver
      // ClientsService.updateBranding), sobrepoe a da agencia nos links
      // publicos deste cliente - merge fica a cargo do frontend.
      cliente: {
        nome: project.client.nome,
        branding: this.clientBranding(project.client),
      },
      agencia: {
        nome: project.account.nomeAgencia,
        logoUrl: project.account.memberships[0]?.user.logoUrl ?? null,
        corDestaque: project.account.memberships[0]?.user.corDestaque ?? null,
      },
      videos: project.videos.map((v) => ({
        id: v.id,
        videoPaiId: v.videoPaiId,
        link: v.linkPublico,
        title: v.nomeArquivo,
        posterUrl: v.thumbnailUrl,
        status: v.status,
        statusProcessamento: v.statusProcessamento,
        versao: v.versao,
      })),
    };
  }

  /**
   * Vitrine publica da agencia (Portfolio) - distinta da galeria de
   * projeto acima: colecao curada manualmente, sem status de aprovacao.
   * Nenhum dado de cliente/projeto e exposto, so o portfolio em si (os
   * itens ja vem denormalizados - ver PortfoliosService.addExistingVideo).
   */
  async getPortfolio(linkPublico: string) {
    const portfolio = await this.prisma.portfolio.findUnique({
      where: { linkPublico },
      select: {
        nome: true,
        descricao: true,
        // So o branding do cliente etiquetado (Portfolio.clienteId) - nome/id
        // do cliente NUNCA sao expostos aqui (vitrine publica nao deve
        // revelar pra quem o album foi personalizado, so a marca visual).
        cliente: { select: { logoUrl: true, corDestaque: true } },
        account: {
          select: {
            nomeAgencia: true,
            memberships: {
              where: { role: UserRole.owner },
              select: { user: { select: { logoUrl: true, corDestaque: true } } },
              orderBy: { criadoEm: 'asc' },
              take: 1,
            },
          },
        },
        videos: {
          orderBy: { ordem: 'asc' },
          select: {
            id: true,
            tipoMidia: true,
            titulo: true,
            descricao: true,
            urlStorage: true,
            urlOtimizada: true,
            posterUrl: true,
            statusProcessamento: true,
            ordem: true,
            criadoEm: true,
          },
        },
      },
    });
    if (!portfolio) {
      throw new NotFoundException('Portfolio nao encontrado');
    }

    const clienteBranding = portfolio.cliente
      ? this.clientBranding(portfolio.cliente)
      : null;

    return {
      nome: portfolio.nome,
      descricao: portfolio.descricao,
      // Presente so quando o album foi etiquetado com um cliente (ver
      // Portfolio.clienteId) que tem marca propria configurada - senao null.
      cliente: clienteBranding ? { branding: clienteBranding } : null,
      agencia: {
        nome: portfolio.account.nomeAgencia,
        logoUrl: portfolio.account.memberships[0]?.user.logoUrl ?? null,
        corDestaque: portfolio.account.memberships[0]?.user.corDestaque ?? null,
      },
      videos: portfolio.videos.map((v) => ({
        id: v.id,
        tipoMidia: v.tipoMidia,
        titulo: v.titulo,
        descricao: v.descricao,
        urlStorage: v.urlOtimizada ?? v.urlStorage,
        posterUrl: v.posterUrl,
        statusProcessamento: v.statusProcessamento,
        ordem: v.ordem,
        criadoEm: v.criadoEm,
      })),
    };
  }

  /**
   * Hub publico unico da agencia (perfil + categorias de portfolio) - ver
   * PortfolioProfileService/PortfolioCategoriesService. So categorias com
   * pelo menos um album com item aparecem (album vazio ou sem categoria
   * fica de fora do hub, mas o link direto /p/:linkPublico continua valendo).
   */
  async getPortfolioHub(linkHub: string) {
    const profile = await this.prisma.portfolioProfile.findUnique({
      where: { linkHub },
      select: {
        fotoUrl: true,
        account: {
          select: {
            nomeAgencia: true,
            memberships: {
              where: { role: UserRole.owner },
              select: { user: { select: { logoUrl: true, corDestaque: true } } },
              orderBy: { criadoEm: 'asc' },
              take: 1,
            },
            portfolioCategories: {
              orderBy: { ordem: 'asc' },
              select: {
                id: true,
                nome: true,
                portfolios: {
                  orderBy: { criadoEm: 'desc' },
                  select: {
                    id: true,
                    nome: true,
                    descricao: true,
                    linkPublico: true,
                    capaUrl: true,
                    // Sem `take` aqui: alem do fallback de capa (primeiro
                    // item por ordem), precisamos de tipoMidia de todos os
                    // itens pra calcular o tipo de midia predominante do
                    // album (ver tipoMidiaPredominante abaixo).
                    videos: {
                      orderBy: { ordem: 'asc' },
                      select: { tipoMidia: true, posterUrl: true },
                    },
                    _count: { select: { videos: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!profile) {
      throw new NotFoundException('Hub de portfolio nao encontrado');
    }

    const categorias = profile.account.portfolioCategories
      .map((cat) => ({
        id: cat.id,
        nome: cat.nome,
        // So albuns com pelo menos um item (video ou foto) - album vazio
        // nao aparece no hub.
        portfolios: cat.portfolios
          .filter((p) => p._count.videos > 0)
          .map((p) => ({
            id: p.id,
            nome: p.nome,
            descricao: p.descricao,
            link: p.linkPublico,
            capaUrl: p.capaUrl ?? p.videos[0]?.posterUrl ?? null,
            tipoMidiaPredominante: this.predominantMediaType(p.videos),
          })),
      }))
      // Categoria sem nenhum album (apos o filtro acima) nao aparece.
      .filter((cat) => cat.portfolios.length > 0);

    return {
      fotoUrl: profile.fotoUrl,
      agencia: {
        nome: profile.account.nomeAgencia,
        logoUrl: profile.account.memberships[0]?.user.logoUrl ?? null,
        corDestaque: profile.account.memberships[0]?.user.corDestaque ?? null,
      },
      categorias,
    };
  }

  /**
   * Maioria simples de tipoMidia entre os itens do album; empate (ou album
   * vazio) cai pra "video" (padrao pedido pelo frontend pro filtro
   * foto/video do hub publico).
   */
  private predominantMediaType(
    items: { tipoMidia: PortfolioMediaType }[],
  ): PortfolioMediaType {
    const fotoCount = items.filter(
      (item) => item.tipoMidia === PortfolioMediaType.foto,
    ).length;
    const videoCount = items.length - fotoCount;
    return fotoCount > videoCount
      ? PortfolioMediaType.foto
      : PortfolioMediaType.video;
  }

  /**
   * Retorna apenas os dados do video referenciado pelo link_publico,
   * seus comentarios e ratings. Nenhum dado de outros videos, projetos
   * ou do profissional e exposto.
   */
  async getVideo(linkPublico: string) {
    const video = await this.resolveVideo(linkPublico);

    const [comments, ratings, queue, ratingQuestions] = await Promise.all([
      this.prisma.comment.findMany({
        // Canal publico: SOMENTE comentarios do canal do cliente. O canal
        // interno da agencia nunca e exposto aqui.
        where: { videoId: video.id, channel: CommentChannel.cliente },
        orderBy: { timestampVideo: 'asc' },
        select: {
          id: true,
          timestampVideo: true,
          texto: true,
          audioUrl: true,
          autorType: true,
          autorNome: true,
          // Respostas do owner ao cliente aparecem no mesmo canal; o nome
          // vem do usuario autenticado (autor_nome fica nulo nesse caso).
          autorUser: { select: { nome: true } },
          parentId: true,
          criadoEm: true,
        },
      }),
      this.prisma.rating.findMany({
        where: { videoId: video.id },
        orderBy: { criadoEm: 'asc' },
        select: {
          id: true,
          ratingQuestionId: true,
          nota: true,
          criadoEm: true,
        },
      }),
      // Fila para o swipe "Preview Reels": todos os videos do mesmo
      // projeto (escopo resolvido a partir do video atual, nunca de um
      // parametro da request), incluindo o proprio video atual - o front
      // localiza a posicao via linkPublico para navegar prev/next. Escopo
      // e o projeto (nao o cliente inteiro) para o reels nao vazar para
      // entregas antigas de outros projetos do mesmo cliente.
      this.prisma.video.findMany({
        where: { projectId: video.projectId },
        orderBy: { criadoEm: 'asc' },
        select: {
          linkPublico: true,
          nomeArquivo: true,
          thumbnailUrl: true,
          status: true,
        },
      }),
      // Perguntas de avaliacao ativas da conta dona deste video (substitui
      // as categorias fixas iluminacao/audio/enquadramento).
      this.prisma.ratingQuestion.findMany({
        where: { accountId: video.project.accountId, ativo: true },
        orderBy: { ordem: 'asc' },
        select: { id: true, texto: true, ordem: true },
      }),
    ]);

    return {
      id: video.id,
      nomeArquivo: video.nomeArquivo,
      urlStorage: video.urlStorage,
      // Versao otimizada para streaming (null enquanto processa); o
      // frontend usa esta se pronta, senao cai no original.
      urlOtimizada: video.urlOtimizada,
      thumbnailUrl: video.thumbnailUrl,
      statusProcessamento: video.statusProcessamento,
      versao: video.versao,
      status: video.status,
      // Nota geral (1-5) dada pelo cliente no momento da aprovacao.
      notaGeral: video.notaGeral,
      criadoEm: video.criadoEm,
      // Dados para montar a visualizacao "Preview Reels" e as Open Graph
      // tags (preview do WhatsApp) no frontend
      projeto: { nome: video.project.nome },
      cliente: {
        nome: video.project.client.nome,
        descricao: video.project.client.descricao,
        fotoUrl: video.project.client.fotoUrl,
      },
      // Branding (white label) da agencia dona do video. O nome vem da
      // conta; logo/cor vem do owner da agencia.
      agencia: {
        nome: video.project.account.nomeAgencia,
        logoUrl: video.project.account.memberships[0]?.user.logoUrl ?? null,
        corDestaque: video.project.account.memberships[0]?.user.corDestaque ?? null,
      },
      // Canal ja filtrado para "cliente": isAgencyReply so distingue a
      // resposta do owner (autorType owner) da mensagem do proprio cliente.
      comments: comments.map((c) => ({
        ...c,
        isAgencyReply: c.autorType === CommentAuthorType.owner,
      })),
      ratings,
      ratingQuestions,
      queue: queue.map((v) => ({
        link: v.linkPublico,
        title: v.nomeArquivo,
        posterUrl: v.thumbnailUrl,
        status: v.status,
      })),
    };
  }

  async addComment(linkPublico: string, dto: CreateCommentDto) {
    // O mic e uma alternativa ao campo de texto: aceita so audio, so texto,
    // ou os dois, mas nao um comentario totalmente vazio.
    if (!dto.texto && !dto.audioUrl) {
      throw new BadRequestException(
        'Informe texto ou audioUrl para o comentario',
      );
    }

    const video = await this.resolveVideo(linkPublico);
    const comment = await this.prisma.comment.create({
      data: {
        videoId: video.id,
        timestampVideo: dto.timestampVideo,
        texto: dto.texto,
        audioUrl: dto.audioUrl,
        // Comentario do cliente externo (sem login): canal cliente,
        // autor cliente, nome livre.
        channel: CommentChannel.cliente,
        autorType: CommentAuthorType.cliente,
        autorNome: dto.autorNome,
      },
      select: {
        id: true,
        timestampVideo: true,
        texto: true,
        audioUrl: true,
        autorType: true,
        autorNome: true,
        criadoEm: true,
      },
    });
    await this.notifications.notify(
      video.id,
      NotificationType.comentario_cliente,
    );
    return comment;
  }

  /**
   * Presigned URL para upload direto do audio do comentario no R2 (mesmo
   * mecanismo do upload de video, so que sem autenticacao - rota publica
   * do cliente). O front sobe o arquivo via PUT em uploadUrl e depois
   * manda o publicUrl como audioUrl em POST .../comments.
   */
  async createCommentAudioUploadUrl(
    linkPublico: string,
    dto: AudioUploadUrlDto,
  ) {
    await this.resolveVideo(linkPublico);
    return this.storage.createPresignedUploadIn(
      'comments-audio',
      dto.nomeArquivo,
      dto.contentType,
    );
  }

  async addRating(linkPublico: string, dto: CreateRatingDto) {
    const video = await this.resolveVideo(linkPublico);

    // Garante que a pergunta pertence a mesma conta deste video - nunca
    // aceita uma rating_question_id de outra agencia.
    const question = await this.prisma.ratingQuestion.findFirst({
      where: { id: dto.ratingQuestionId, accountId: video.project.accountId },
      select: { id: true },
    });
    if (!question) {
      throw new NotFoundException('Pergunta de avaliacao nao encontrada');
    }

    const rating = await this.prisma.rating.create({
      data: {
        videoId: video.id,
        ratingQuestionId: dto.ratingQuestionId,
        nota: dto.nota,
      },
      select: {
        id: true,
        ratingQuestionId: true,
        nota: true,
        criadoEm: true,
      },
    });
    await this.notifications.notify(
      video.id,
      NotificationType.avaliacao_cliente,
    );
    return rating;
  }

  async approve(linkPublico: string, dto: ApproveVideoDto) {
    const updated = await this.setStatus(
      linkPublico,
      VideoStatus.aprovado,
      dto.notaGeral,
    );
    await this.notifications.notify(
      updated.id,
      NotificationType.aprovacao_cliente,
    );
    return updated;
  }

  async requestChanges(linkPublico: string) {
    const updated = await this.setStatus(linkPublico, VideoStatus.ajuste);
    await this.notifications.notify(
      updated.id,
      NotificationType.ajuste_solicitado,
    );
    return updated;
  }

  async updateTitulo(linkPublico: string, dto: UpdateTituloDto) {
    const video = await this.resolveVideo(linkPublico);
    return this.prisma.video.update({
      where: { id: video.id },
      data: { nomeArquivo: dto.nomeArquivo },
      select: {
        id: true,
        nomeArquivo: true,
        status: true,
        aprovadoEm: true,
        notaGeral: true,
      },
    });
  }

  // Decisao do cliente na tela publica tambem avanca a etapa de producao
  // interna (board Kanban), pra equipe nao precisar arrastar o card na mao
  // toda vez que o cliente aprova ou pede ajuste.
  private static readonly ETAPA_BY_STATUS: Partial<
    Record<VideoStatus, EtapaProducao>
  > = {
    [VideoStatus.aprovado]: EtapaProducao.aprovado,
    [VideoStatus.ajuste]: EtapaProducao.ajustes,
  };

  private async setStatus(
    linkPublico: string,
    status: VideoStatus,
    notaGeral?: number,
  ) {
    const video = await this.resolveVideo(linkPublico);
    const etapaProducao = PublicService.ETAPA_BY_STATUS[status];
    const updated = await this.prisma.video.update({
      where: { id: video.id },
      data: {
        status,
        ...(etapaProducao ? { etapaProducao } : {}),
        // Carimba o momento da aprovacao (usado nas metricas de tempo
        // medio de aprovacao). Nao mexe em outras transicoes.
        ...(status === VideoStatus.aprovado
          ? { aprovadoEm: new Date(), ...(notaGeral ? { notaGeral } : {}) }
          : {}),
      },
      select: {
        id: true,
        status: true,
        aprovadoEm: true,
        notaGeral: true,
        etapaProducao: true,
      },
    });
    return updated;
  }

  /**
   * Marca propria do cliente ({ logoUrl, corDestaque }), ou null quando o
   * cliente nao tem nenhum campo configurado - nesse caso o frontend cai
   * de volta no branding da agencia (merge campo a campo).
   */
  private clientBranding(client: {
    logoUrl: string | null;
    corDestaque: string | null;
  }) {
    return client.logoUrl || client.corDestaque
      ? { logoUrl: client.logoUrl, corDestaque: client.corDestaque }
      : null;
  }

  /**
   * Resolve o video pelo link_publico ou lanca 404.
   * Seleciona apenas campos publicos - nunca expoe project_id/user.
   */
  private async resolveVideo(linkPublico: string) {
    const video = await this.prisma.video.findUnique({
      where: { linkPublico },
      select: {
        id: true,
        nomeArquivo: true,
        urlStorage: true,
        thumbnailUrl: true,
        urlOtimizada: true,
        statusProcessamento: true,
        versao: true,
        status: true,
        notaGeral: true,
        criadoEm: true,
        // Usado so internamente para escopar a queue (nunca vai na resposta).
        projectId: true,
        // Somente o nome do projeto/cliente e o branding da agencia deste
        // video - nada mais e exposto.
        project: {
          select: {
            nome: true,
            accountId: true,
            client: {
              select: { nome: true, descricao: true, fotoUrl: true },
            },
            account: {
              select: {
                nomeAgencia: true,
                // Branding (logo/cor) vem do owner da agencia. Pode haver
                // mais de um owner - usa o mais antigo (fundador) para o
                // branding ser estavel em vez de depender da ordem do banco.
                memberships: {
                  where: { role: UserRole.owner },
                  select: { user: { select: { logoUrl: true, corDestaque: true } } },
                  orderBy: { criadoEm: 'asc' },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });
    if (!video) {
      throw new NotFoundException('Video nao encontrado');
    }
    return video;
  }
}

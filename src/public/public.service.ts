import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ClientActivityAtorTipo,
  ClientActivityType,
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
import { ClientActivityService } from '../client-activity/client-activity.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CreateRatingDto } from './dto/create-rating.dto';
import { ApproveVideoDto } from './dto/approve-video.dto';
import { AudioUploadUrlDto } from './dto/audio-upload-url.dto';
import { UpdateTituloDto } from './dto/update-titulo.dto';
import { DownloadTipo } from './dto/video-download.dto';
import {
  downloadFileName,
  videoContentTypeFromKey,
} from '../common/download-file.util';

@Injectable()
export class PublicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly storage: StorageService,
    private readonly clientActivity: ClientActivityService,
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
              select: {
                user: { select: { logoUrl: true, corDestaque: true } },
              },
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
            criadoEm: true,
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
      // Uma cadeia de versões representa uma única entrega para o cliente.
      // A galeria pública mostra só a ponta atual de cada cadeia; as linhas
      // substituídas seguem disponíveis exclusivamente no histórico interno.
      videos: this.latestProjectVideos(project.videos).map((v) => ({
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
              select: {
                user: { select: { logoUrl: true, corDestaque: true } },
              },
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
        templateId: true,
        account: {
          select: {
            nomeAgencia: true,
            memberships: {
              where: { role: UserRole.owner },
              select: {
                user: { select: { logoUrl: true, corDestaque: true } },
              },
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
      templateId: profile.templateId,
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
   * vazio) cai pra "video". Design e um terceiro tipo de imagem com rotulo
   * proprio, portanto nao e normalizado para foto.
   */
  private predominantMediaType(
    items: { tipoMidia: PortfolioMediaType }[],
  ): PortfolioMediaType {
    const counts = new Map<PortfolioMediaType, number>([
      [PortfolioMediaType.video, 0],
      [PortfolioMediaType.foto, 0],
      [PortfolioMediaType.design, 0],
    ]);
    for (const item of items) {
      counts.set(item.tipoMidia, (counts.get(item.tipoMidia) ?? 0) + 1);
    }

    const maxCount = Math.max(...counts.values());
    const predominant = [...counts.entries()].filter(
      ([, count]) => count === maxCount,
    );
    return predominant.length === 1
      ? predominant[0][0]
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
      // Link canonico da versao entregue. Quando o cliente abre o link de
      // uma versao antiga, este NAO e o link da URL acessada - e o da ultima
      // versao, que e a que esta sendo reproduzida.
      linkPublico: video.linkPublico,
      // Auditoria da resolucao de versao (ver resolveVideo): `versao` /
      // `latestVersionId` sao sempre os da versao entregue;
      // `resolvedFromVersion` e a versao do link que o cliente acessou.
      // Iguais quando o link ja era o da ultima versao.
      latestVersionId: video.id,
      resolvedFromVersion: video.resolvedFromVersion,
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
        corDestaque:
          video.project.account.memberships[0]?.user.corDestaque ?? null,
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

  /**
   * Link de download de UM video do canal publico (o botao "baixar" da tela
   * de aprovacao). Devolve uma URL temporaria assinada que ja carrega
   * Content-Disposition: attachment e o Content-Type certo, de modo que o
   * front so precisa abrir o link - sem fetch, sem blob e sem depender do
   * CORS do bucket, que e o unico caminho que funciona no Safari do iPhone.
   *
   * `tipo=otimizado` cai de volta no original enquanto o processamento nao
   * terminou: o botao nunca fica sem resposta, e o campo `tipo` da resposta
   * diz qual arquivo foi realmente entregue.
   */
  async getVideoDownload(linkPublico: string, tipo: DownloadTipo = 'original') {
    const { latestId } = await this.resolveVersionChain(linkPublico);
    const video = await this.prisma.video.findUnique({
      where: { id: latestId },
      select: {
        nomeArquivo: true,
        urlStorage: true,
        urlOtimizada: true,
        statusProcessamento: true,
      },
    });
    if (!video) {
      throw new NotFoundException('Video nao encontrado');
    }

    const entregaOtimizada = tipo === 'otimizado' && !!video.urlOtimizada;
    const sourceUrl = entregaOtimizada
      ? (video.urlOtimizada as string)
      : video.urlStorage;
    const tipoEntregue: DownloadTipo = entregaOtimizada
      ? 'otimizado'
      : 'original';

    const key = this.storage.keyFromPublicUrl(sourceUrl);
    if (!key) {
      // Video hospedado fora do nosso bucket (o video de exemplo do
      // onboarding): nao ha o que assinar, devolve a URL como esta.
      return {
        url: sourceUrl,
        filename: downloadFileName(video.nomeArquivo, sourceUrl),
        tipo: tipoEntregue,
        statusProcessamento: video.statusProcessamento,
        expiresIn: null,
      };
    }

    const filename = downloadFileName(video.nomeArquivo, key);
    const { url, expiresIn } = await this.storage.createPresignedDownload(
      key,
      filename,
      videoContentTypeFromKey(key),
    );
    return {
      url,
      filename,
      tipo: tipoEntregue,
      statusProcessamento: video.statusProcessamento,
      expiresIn,
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
    await this.clientActivity.log({
      accountId: video.project.accountId,
      clienteId: video.project.clientId,
      tipo: ClientActivityType.comentario_cliente,
      atorTipo: ClientActivityAtorTipo.cliente,
      atorNome: dto.autorNome,
      videoId: video.id,
      projectId: video.projectId,
      descricao: dto.texto ?? null,
    });
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

    const activityTipo =
      status === VideoStatus.aprovado
        ? ClientActivityType.aprovacao_cliente
        : status === VideoStatus.ajuste
          ? ClientActivityType.ajuste_solicitado
          : null;
    if (activityTipo) {
      await this.clientActivity.log({
        accountId: video.project.accountId,
        clienteId: video.project.clientId,
        tipo: activityTipo,
        atorTipo: ClientActivityAtorTipo.cliente,
        videoId: video.id,
        projectId: video.projectId,
      });
    }

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
   * Retorna uma única versão atual por cadeia do projeto. Em caso de dois
   * filhos criados em paralelo, usa a maior versão e, em seguida, a criação
   * mais recente como desempate determinístico.
   */
  private latestProjectVideos<
    T extends {
      id: string;
      videoPaiId: string | null;
      versao: number;
      criadoEm: Date;
    },
  >(videos: T[]): T[] {
    const byId = new Map(videos.map((video) => [video.id, video]));
    const rootById = new Map<string, string>();

    const rootOf = (video: T): string => {
      const cached = rootById.get(video.id);
      if (cached) return cached;

      const visited = new Set<string>();
      let current = video;
      while (current.videoPaiId && !visited.has(current.id)) {
        visited.add(current.id);
        const parent = byId.get(current.videoPaiId);
        if (!parent) break;
        current = parent;
      }
      rootById.set(video.id, current.id);
      return current.id;
    };

    const latestByRoot = new Map<string, T>();
    for (const video of videos) {
      const rootId = rootOf(video);
      const current = latestByRoot.get(rootId);
      if (
        !current ||
        video.versao > current.versao ||
        (video.versao === current.versao && video.criadoEm > current.criadoEm)
      ) {
        latestByRoot.set(rootId, video);
      }
    }

    const latestIds = new Set(
      [...latestByRoot.values()].map((video) => video.id),
    );
    return videos.filter((video) => latestIds.has(video.id));
  }

  /**
   * Profundidade maxima percorrida na cadeia de versoes. Guarda contra
   * cadeia corrompida (ciclo em video_pai_id, possivel em teoria porque o
   * banco nao impede) - sem isso o CTE recursivo nao terminaria.
   */
  private static readonly MAX_VERSION_DEPTH = 50;

  /**
   * Resolve o video ENTREGUE por um link_publico: nao o video do proprio
   * link, e sim a ULTIMA versao da cadeia (video_pai_id) que comeca nele.
   *
   * O link publico e enviado ao cliente uma unica vez; quando o editor sobe
   * uma correcao (POST /videos/:id/new-version) nasce um video filho com
   * link novo, e o link que o cliente ja tem em maos ficaria preso na versao
   * antiga. Resolver a cadeia aqui faz qualquer link da familia (o original
   * inclusive) abrir sempre a versao atual, sem reenviar link a cada ajuste.
   *
   * Vale para TODAS as acoes do canal publico (comentario, rating, aprovacao,
   * titulo), nao so a leitura: o cliente comenta/aprova o que esta vendo.
   * Comentarios e avaliacoes das versoes anteriores continuam presos aos
   * respectivos videos - o historico e preservado, so a tela publica anda.
   */
  private async resolveVideo(linkPublico: string) {
    const { requestedVersao, latestId } =
      await this.resolveVersionChain(linkPublico);
    const video = await this.loadPublicVideo(latestId);
    if (!video) {
      throw new NotFoundException('Video nao encontrado');
    }
    return { ...video, resolvedFromVersion: requestedVersao };
  }

  /**
   * Desce a cadeia de versoes a partir do video do link (CTE recursivo, uma
   * unica query - a alternativa seria um SELECT por nivel). Empate teorico
   * (dois filhos do mesmo pai, se duas novas versoes forem criadas a partir
   * do mesmo video) e desempatado de forma deterministica pela maior versao,
   * depois pela mais recente.
   */
  private async resolveVersionChain(linkPublico: string) {
    const rows = await this.prisma.$queryRaw<
      { id: string; versao: number; depth: number }[]
    >`
      WITH RECURSIVE chain AS (
        SELECT v.id, v.versao, v.criado_em, 0 AS depth
        FROM videos v
        WHERE v.link_publico = ${linkPublico}
        UNION ALL
        SELECT f.id, f.versao, f.criado_em, c.depth + 1
        FROM videos f
        JOIN chain c ON f.video_pai_id = c.id
        WHERE c.depth < ${PublicService.MAX_VERSION_DEPTH}
      )
      SELECT id, versao, depth FROM chain
      ORDER BY versao DESC, depth DESC, criado_em DESC, id DESC
    `;
    if (rows.length === 0) {
      throw new NotFoundException('Video nao encontrado');
    }
    // depth 0 e sempre o video do link acessado; a primeira linha (ordenacao
    // acima) e a ultima versao da cadeia.
    const requested = rows.find((row) => row.depth === 0) ?? rows[0];
    return { requestedVersao: requested.versao, latestId: rows[0].id };
  }

  /**
   * Carrega os campos publicos do video ja resolvido.
   * Seleciona apenas campos publicos - nunca expoe project_id/user.
   */
  private async loadPublicVideo(id: string) {
    return this.prisma.video.findUnique({
      where: { id },
      select: {
        id: true,
        // Link canonico da versao entregue - pode ser diferente do link que
        // o cliente acessou (ver resolveVideo).
        linkPublico: true,
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
            clientId: true,
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
                  select: {
                    user: { select: { logoUrl: true, corDestaque: true } },
                  },
                  orderBy: { criadoEm: 'asc' },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });
  }
}

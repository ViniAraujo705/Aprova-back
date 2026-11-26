import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EtapaProducao,
  LabelColor,
  Prisma,
  UserRole,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateDemandaDto } from './dto/create-demanda.dto';
import { UpdateDemandaDto } from './dto/update-demanda.dto';
import {
  CreateChecklistItemDto,
  UpdateChecklistItemDto,
} from './dto/checklist-item.dto';
import {
  CreateComentarioDto,
  UpdateComentarioDto,
} from './dto/comentario.dto';
import {
  AnexoUploadUrlDto,
  COVER_TYPES,
  RegisterAnexoDto,
} from './dto/anexo.dto';
import { CopiarDemandaDto, DestinoDemandaDto } from './dto/mover-demanda.dto';

const ANEXOS_PASTA = 'demanda-anexos';
// Referencia/briefing, nao o video final: 100 MB como os arquivos de cliente.
const MAX_ANEXO_BYTES = 100 * 1024 * 1024;

const ANEXO_SELECT = {
  id: true,
  nomeArquivo: true,
  urlStorage: true,
  mimeType: true,
  tamanhoBytes: true,
  criadoEm: true,
  enviadoPor: { select: { id: true, nome: true } },
} as const;

const AUTOR_SELECT = { select: { id: true, nome: true, avatarUrl: true } } as const;

const COMENTARIO_SELECT = {
  id: true,
  texto: true,
  mencionados: true,
  criadoEm: true,
  editadoEm: true,
  autor: AUTOR_SELECT,
} as const;

/** Espaco entre posicoes novas: deixa folga para inserir entre dois cards. */
const POSICAO_PASSO = 1024;

const CHECKLIST_SELECT = {
  id: true,
  texto: true,
  concluido: true,
  posicao: true,
} as const;

const DEMANDA_SELECT = {
  id: true,
  titulo: true,
  tipo: true,
  clienteId: true,
  responsavelId: true,
  prazo: true,
  etapa: true,
  videoId: true,
  descricao: true,
  posicao: true,
  arquivadaEm: true,
  prazoConcluido: true,
  capaAnexoId: true,
  capaCor: true,
  quadroId: true,
  colunaId: true,
  criadoEm: true,
  atualizadoEm: true,
  cliente: { select: { nome: true } },
  responsavel: { select: { nome: true } },
  labels: { select: { labelId: true } },
  collaborators: { select: { userId: true } },
  checklist: {
    select: CHECKLIST_SELECT,
    orderBy: { posicao: 'asc' as const },
  },
  anexos: { select: ANEXO_SELECT, orderBy: { criadoEm: 'desc' as const } },
  _count: { select: { comentarios: true } },
} as const;

type RawDemanda = {
  _count?: { comentarios: number };
  cliente: { nome: string } | null;
  responsavel: { nome: string } | null;
  labels: { labelId: string }[];
  collaborators: { userId: string }[];
} & Record<string, unknown>;

function toDto(demanda: RawDemanda) {
  const { cliente, responsavel, labels, collaborators, _count, ...rest } =
    demanda;
  return {
    ...rest,
    comentariosCount: _count?.comentarios ?? 0,
    clienteNome: cliente?.nome ?? null,
    responsavelNome: responsavel?.nome ?? null,
    labelIds: labels.map((label) => label.labelId),
    collaboratorIds: collaborators.map((collaborator) => collaborator.userId),
  };
}

@Injectable()
export class DemandasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly storage: StorageService,
  ) {}

  async create(accountId: string, dto: CreateDemandaDto, autorId: string) {
    await this.assertRefsBelongToAccount(accountId, dto);
    await this.assertKanbanRefsBelongToAccount(
      accountId,
      dto.labelIds,
      dto.collaboratorIds,
    );

    const etapa = dto.etapa ?? EtapaProducao.planejado;
    const lugar = dto.quadroId
      ? await this.resolverColuna(accountId, dto.quadroId, dto.colunaId)
      : { quadroId: null, colunaId: null };
    // Card novo entra no fim da coluna, como no Trello.
    const ultima = await this.prisma.demanda.aggregate({
      where: { accountId, arquivadaEm: null, ...this.escopoColuna({ etapa, ...lugar }) },
      _max: { posicao: true },
    });
    const demanda = await this.prisma.demanda.create({
      data: {
        accountId,
        titulo: dto.titulo,
        descricao: dto.descricao?.trim() || null,
        posicao: (ultima._max.posicao ?? 0) + POSICAO_PASSO,
        tipo: dto.tipo,
        clienteId: dto.clienteId ?? null,
        responsavelId: dto.responsavelId ?? null,
        prazo: dto.prazo ? new Date(dto.prazo) : null,
        etapa,
        quadroId: lugar.quadroId,
        colunaId: lugar.colunaId,
        ...(dto.labelIds
          ? { labels: { create: dto.labelIds.map((labelId) => ({ labelId })) } }
          : {}),
        ...(dto.collaboratorIds
          ? {
              collaborators: {
                create: dto.collaboratorIds.map((userId) => ({ userId })),
              },
            }
          : {}),
      },
      select: DEMANDA_SELECT,
    });
    await this.registrar(demanda.id, autorId, 'criou', { etapa });
    await this.notifications.notifyDemanda(
      accountId,
      demanda.id,
      [demanda.responsavelId, ...demanda.collaborators.map((c) => c.userId)],
      autorId,
    );
    return toDto(demanda);
  }

  async findAll(accountId: string, arquivadas = false, quadroId?: string) {
    if (quadroId) await this.resolverColuna(accountId, quadroId, undefined);
    const demandas = await this.prisma.demanda.findMany({
      where: {
        accountId,
        quadroId: quadroId ?? null,
        arquivadaEm: arquivadas ? { not: null } : null,
      },
      orderBy: arquivadas
        ? { arquivadaEm: 'desc' }
        : [{ posicao: 'asc' }, { criadoEm: 'desc' }],
      select: DEMANDA_SELECT,
    });
    return demandas.map(toDto);
  }

  async agenda(accountId: string, de: string, ate: string) {
    const inicio = new Date(de);
    const fim = new Date(ate);
    if (fim < inicio) throw new BadRequestException('ate antes de de');
    if (fim.getTime() - inicio.getTime() > 62 * 86_400_000) {
      throw new BadRequestException('Intervalo maximo de 62 dias');
    }
    const demandas = await this.prisma.demanda.findMany({
      where: { accountId, arquivadaEm: null, prazo: { gte: inicio, lte: fim } },
      orderBy: [{ prazo: 'asc' }, { posicao: 'asc' }],
      take: 500,
      select: { ...DEMANDA_SELECT, quadro: { select: { nome: true } } },
    });
    return demandas.map(({ quadro, ...d }) => ({
      ...toDto(d),
      quadroNome: quadro?.nome ?? null,
    }));
  }

  async update(
    accountId: string,
    id: string,
    dto: UpdateDemandaDto,
    autorId: string,
  ) {
    await this.getOwned(accountId, id);
    const antes = await this.prisma.demanda.findUniqueOrThrow({
      where: { id },
      select: {
        titulo: true,
        prazo: true,
        prazoConcluido: true,
        responsavelId: true,
        collaborators: { select: { userId: true } },
      },
    });
    const jaNaDemanda = new Set([
      antes.responsavelId,
      ...antes.collaborators.map((c) => c.userId),
    ]);
    await this.assertRefsBelongToAccount(accountId, dto);
    await this.assertKanbanRefsBelongToAccount(
      accountId,
      dto.labelIds,
      dto.collaboratorIds,
    );

    const demanda = await this.prisma.demanda.update({
      where: { id },
      data: {
        ...(dto.titulo !== undefined ? { titulo: dto.titulo } : {}),
        ...(dto.tipo !== undefined ? { tipo: dto.tipo } : {}),
        ...(dto.descricao !== undefined
          ? { descricao: dto.descricao?.trim() || null }
          : {}),
        ...(dto.prazoConcluido !== undefined
          ? { prazoConcluido: dto.prazoConcluido }
          : {}),
        ...(dto.clienteId !== undefined ? { clienteId: dto.clienteId } : {}),
        ...(dto.responsavelId !== undefined
          ? { responsavelId: dto.responsavelId }
          : {}),
        ...(dto.prazo !== undefined
          ? {
              prazo: dto.prazo ? new Date(dto.prazo) : null,
              // Prazo novo volta a valer: desmarca o "cumprido".
              ...(dto.prazoConcluido === undefined
                ? { prazoConcluido: false }
                : {}),
            }
          : {}),
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
      select: DEMANDA_SELECT,
    });
    // So quem entrou agora na demanda; a chave unica por demanda em
    // notifyDemanda ainda evita repetir para quem saiu e voltou.
    await this.notifications.notifyDemanda(
      accountId,
      demanda.id,
      [
        demanda.responsavelId,
        ...demanda.collaborators.map((c) => c.userId),
      ].filter((userId) => !jaNaDemanda.has(userId)),
      autorId,
    );
    await this.registrarEdicao(demanda.id, autorId, antes, demanda);
    return toDto(demanda);
  }

  async updateEtapa(
    accountId: string,
    id: string,
    etapa: EtapaProducao,
    posicao?: number,
    autorId?: string,
  ) {
    await this.getOwned(accountId, id);
    const antes = await this.prisma.demanda.findUniqueOrThrow({
      where: { id },
      select: { etapa: true, quadroId: true },
    });
    if (antes.quadroId) {
      throw new BadRequestException(
        'Card de quadro extra muda de coluna por /coluna, nao por etapa',
      );
    }
    const demanda = await this.prisma.demanda.update({
      where: { id },
      data: { etapa, ...(posicao !== undefined ? { posicao } : {}) },
      select: DEMANDA_SELECT,
    });
    if (antes.etapa !== etapa) {
      await this.registrar(id, autorId, 'moveu', { de: antes.etapa, para: etapa });
    }
    return toDto(demanda);
  }

  async updateColuna(
    accountId: string,
    id: string,
    colunaId: string,
    posicao?: number,
    autorId?: string,
  ) {
    await this.getOwned(accountId, id);
    const antes = await this.prisma.demanda.findUniqueOrThrow({
      where: { id },
      select: { quadroId: true, colunaId: true, coluna: { select: { nome: true } } },
    });
    if (!antes.quadroId) {
      throw new BadRequestException('Card do quadro de producao muda por /etapa');
    }
    const destino = await this.prisma.quadroColuna.findFirst({
      where: { id: colunaId, quadroId: antes.quadroId },
      select: { id: true, nome: true },
    });
    if (!destino) throw new BadRequestException('Coluna de outro quadro');
    const demanda = await this.prisma.demanda.update({
      where: { id },
      data: { colunaId, ...(posicao !== undefined ? { posicao } : {}) },
      select: DEMANDA_SELECT,
    });
    if (antes.colunaId !== colunaId) {
      await this.registrar(id, autorId, 'moveu', {
        de: antes.coluna?.nome ?? null,
        para: destino.nome,
        coluna: true,
      });
    }
    return toDto(demanda);
  }

  async archive(accountId: string, id: string, autorId?: string) {
    await this.getOwned(accountId, id);
    const demanda = await this.prisma.demanda.update({
      where: { id },
      data: { arquivadaEm: new Date() },
      select: DEMANDA_SELECT,
    });
    await this.registrar(id, autorId, 'arquivou');
    return toDto(demanda);
  }

  async unarchive(accountId: string, id: string, autorId?: string) {
    const atual = await this.prisma.demanda.findFirst({
      where: { id, accountId },
      select: { etapa: true, quadroId: true, colunaId: true },
    });
    if (!atual) throw new NotFoundException('Demanda nao encontrada');
    // Coluna apagada enquanto o card estava arquivado: volta na primeira.
    if (atual.quadroId && !atual.colunaId) {
      const primeira = await this.resolverColuna(accountId, atual.quadroId, undefined);
      atual.colunaId = primeira.colunaId;
    }
    // Volta para o fim da coluna em que estava.
    const ultima = await this.prisma.demanda.aggregate({
      where: { accountId, arquivadaEm: null, ...this.escopoColuna(atual) },
      _max: { posicao: true },
    });
    const demanda = await this.prisma.demanda.update({
      where: { id },
      data: {
        arquivadaEm: null,
        colunaId: atual.colunaId,
        posicao: (ultima._max.posicao ?? 0) + POSICAO_PASSO,
      },
      select: DEMANDA_SELECT,
    });
    await this.registrar(id, autorId, 'desarquivou');
    return toDto(demanda);
  }

  async addChecklistItem(
    accountId: string,
    demandaId: string,
    dto: CreateChecklistItemDto,
  ) {
    await this.getOwned(accountId, demandaId);
    const ultima = await this.prisma.demandaChecklistItem.aggregate({
      where: { demandaId },
      _max: { posicao: true },
    });
    return this.prisma.demandaChecklistItem.create({
      data: {
        demandaId,
        texto: dto.texto.trim(),
        posicao: (ultima._max.posicao ?? 0) + POSICAO_PASSO,
      },
      select: CHECKLIST_SELECT,
    });
  }

  async updateChecklistItem(
    accountId: string,
    demandaId: string,
    itemId: string,
    dto: UpdateChecklistItemDto,
    autorId?: string,
  ) {
    await this.getOwnedChecklistItem(accountId, demandaId, itemId);
    const antes = await this.prisma.demandaChecklistItem.findUniqueOrThrow({
      where: { id: itemId },
      select: { concluido: true },
    });
    if (dto.concluido === true && !antes.concluido) {
      const texto =
        dto.texto?.trim() ??
        (
          await this.prisma.demandaChecklistItem.findUniqueOrThrow({
            where: { id: itemId },
            select: { texto: true },
          })
        ).texto;
      await this.registrar(demandaId, autorId, 'checklist_feito', { item: texto });
    }
    return this.prisma.demandaChecklistItem.update({
      where: { id: itemId },
      data: {
        ...(dto.texto !== undefined ? { texto: dto.texto.trim() } : {}),
        ...(dto.concluido !== undefined ? { concluido: dto.concluido } : {}),
        ...(dto.posicao !== undefined ? { posicao: dto.posicao } : {}),
      },
      select: CHECKLIST_SELECT,
    });
  }

  async removeChecklistItem(
    accountId: string,
    demandaId: string,
    itemId: string,
  ) {
    await this.getOwnedChecklistItem(accountId, demandaId, itemId);
    await this.prisma.demandaChecklistItem.delete({ where: { id: itemId } });
    return { deleted: true };
  }

  /* -------------------------------- anexos -------------------------------- */

  async createAnexoUploadUrl(
    accountId: string,
    demandaId: string,
    dto: AnexoUploadUrlDto,
  ) {
    await this.getOwned(accountId, demandaId);
    return this.storage.createPresignedUploadIn(
      ANEXOS_PASTA,
      dto.nomeArquivo,
      dto.contentType,
    );
  }

  /**
   * Registra o arquivo ja enviado ao R2. Confere que o objeto existe e o
   * tamanho real (nunca o informado pelo front). A primeira imagem anexada
   * vira capa do card, como no Trello.
   */
  async addAnexo(
    accountId: string,
    demandaId: string,
    dto: RegisterAnexoDto,
    autorId: string,
  ) {
    await this.getOwned(accountId, demandaId);
    const key = this.storage.keyFromPublicUrl(dto.urlStorage);
    if (!key || !key.startsWith(`${ANEXOS_PASTA}/`)) {
      throw new BadRequestException('urlStorage invalido');
    }
    const { exists, sizeBytes } = await this.storage.headObject(key);
    if (!exists) {
      throw new BadRequestException(
        'Arquivo nao encontrado no storage. O envio pode ter falhado; tente de novo.',
      );
    }
    if (sizeBytes !== null && sizeBytes > MAX_ANEXO_BYTES) {
      await this.storage.deleteObject(key).catch(() => undefined);
      throw new BadRequestException('Arquivo maior que 100 MB.');
    }
    const anexo = await this.prisma.demandaAnexo.create({
      data: {
        demandaId,
        nomeArquivo: dto.nomeArquivo.trim(),
        urlStorage: dto.urlStorage,
        mimeType: dto.mimeType,
        tamanhoBytes: sizeBytes,
        enviadoPorId: autorId,
      },
      select: ANEXO_SELECT,
    });
    if (COVER_TYPES.includes(dto.mimeType)) {
      await this.prisma.demanda.updateMany({
        where: { id: demandaId, capaAnexoId: null },
        data: { capaAnexoId: anexo.id },
      });
    }
    await this.registrar(demandaId, autorId, 'anexou', {
      arquivo: anexo.nomeArquivo,
    });
    return this.findOneDto(demandaId);
  }

  async removeAnexo(
    accountId: string,
    demandaId: string,
    anexoId: string,
    autorId: string,
  ) {
    await this.getOwned(accountId, demandaId);
    const anexo = await this.prisma.demandaAnexo.findFirst({
      where: { id: anexoId, demandaId },
      select: { id: true, urlStorage: true, nomeArquivo: true },
    });
    if (!anexo) throw new NotFoundException('Anexo nao encontrado');
    await this.prisma.demandaAnexo.delete({ where: { id: anexoId } });
    await this.prisma.demanda.updateMany({
      where: { id: demandaId, capaAnexoId: anexoId },
      data: { capaAnexoId: null },
    });
    const key = this.storage.keyFromPublicUrl(anexo.urlStorage);
    if (key) await this.storage.deleteObject(key).catch(() => undefined);
    await this.registrar(demandaId, autorId, 'removeu_anexo', {
      arquivo: anexo.nomeArquivo,
    });
    return this.findOneDto(demandaId);
  }

  /**
   * Define a capa do card: imagem de um anexo do proprio card OU so uma cor
   * (como no Trello). Uma tira a outra; sem as duas, o card fica sem capa.
   */
  async setCapa(
    accountId: string,
    demandaId: string,
    anexoId: string | null,
    cor: LabelColor | null = null,
  ) {
    await this.getOwned(accountId, demandaId);
    if (anexoId) {
      const anexo = await this.prisma.demandaAnexo.findFirst({
        where: { id: anexoId, demandaId },
        select: { mimeType: true },
      });
      if (!anexo) throw new NotFoundException('Anexo nao encontrado');
      if (!COVER_TYPES.includes(anexo.mimeType)) {
        throw new BadRequestException('So imagem pode ser capa');
      }
    }
    await this.prisma.demanda.update({
      where: { id: demandaId },
      data: { capaAnexoId: anexoId, capaCor: anexoId ? null : cor },
    });
    return this.findOneDto(demandaId);
  }

  /* ------------------------- mover / copiar (Trello) ------------------------ */

  /** Valida o destino e devolve onde o card fica + a posicao no fim da coluna. */
  private async resolverDestino(
    accountId: string,
    dto: DestinoDemandaDto,
    etapaAtual: EtapaProducao,
    ignorarId?: string,
  ) {
    const lugar = dto.quadroId
      ? await this.resolverColuna(accountId, dto.quadroId, dto.colunaId)
      : { quadroId: null, colunaId: null };
    const etapa = dto.quadroId ? etapaAtual : (dto.etapa ?? etapaAtual);
    let posicao = dto.posicao;
    if (posicao === undefined) {
      const ultima = await this.prisma.demanda.aggregate({
        where: {
          accountId,
          arquivadaEm: null,
          ...(ignorarId ? { id: { not: ignorarId } } : {}),
          ...this.escopoColuna({ etapa, ...lugar }),
        },
        _max: { posicao: true },
      });
      posicao = (ultima._max.posicao ?? 0) + POSICAO_PASSO;
    }
    return { ...lugar, etapa, posicao };
  }

  /** Nome legivel do destino, para o historico ("Producao · Edicao", "Quadro · Coluna"). */
  private async nomeDoLugar(quadroId: string | null, colunaId: string | null, etapa: EtapaProducao) {
    if (!quadroId) return { quadro: null, coluna: etapa };
    const coluna = colunaId
      ? await this.prisma.quadroColuna.findUnique({
          where: { id: colunaId },
          select: { nome: true, quadro: { select: { nome: true } } },
        })
      : null;
    return { quadro: coluna?.quadro.nome ?? null, coluna: coluna?.nome ?? null };
  }

  /** Move o card para outro quadro (ou de volta para o de producao). */
  async mover(accountId: string, id: string, dto: DestinoDemandaDto, autorId: string) {
    await this.getOwned(accountId, id);
    const antes = await this.prisma.demanda.findUniqueOrThrow({
      where: { id },
      select: { etapa: true, quadroId: true, colunaId: true },
    });
    const destino = await this.resolverDestino(accountId, dto, antes.etapa, id);
    const demanda = await this.prisma.demanda.update({
      where: { id },
      data: {
        quadroId: destino.quadroId,
        colunaId: destino.colunaId,
        etapa: destino.etapa,
        posicao: destino.posicao,
      },
      select: DEMANDA_SELECT,
    });
    const mudou =
      antes.quadroId !== destino.quadroId ||
      antes.colunaId !== destino.colunaId ||
      antes.etapa !== destino.etapa;
    if (mudou) {
      const de = await this.nomeDoLugar(antes.quadroId, antes.colunaId, antes.etapa);
      const para = await this.nomeDoLugar(destino.quadroId, destino.colunaId, destino.etapa);
      await this.registrar(id, autorId, 'moveu_quadro', { de, para });
    }
    return toDto(demanda);
  }

  /**
   * Cria uma copia do card no destino. Copia descricao, tipo, cliente,
   * responsavel, prazo e capa colorida; checklist, etiquetas e membros sao
   * opcionais (como no Trello). Anexos e comentarios nao vao junto.
   */
  async copiar(accountId: string, id: string, dto: CopiarDemandaDto, autorId: string) {
    await this.getOwned(accountId, id);
    const origem = await this.prisma.demanda.findUniqueOrThrow({
      where: { id },
      select: {
        titulo: true,
        tipo: true,
        descricao: true,
        clienteId: true,
        responsavelId: true,
        prazo: true,
        prazoConcluido: true,
        etapa: true,
        capaCor: true,
        labels: { select: { labelId: true } },
        collaborators: { select: { userId: true } },
        checklist: {
          select: { texto: true, concluido: true, posicao: true },
          orderBy: { posicao: 'asc' },
        },
      },
    });
    const destino = await this.resolverDestino(accountId, dto, origem.etapa);
    const manterChecklist = dto.manterChecklist ?? true;
    const manterEtiquetas = dto.manterEtiquetas ?? true;
    const manterMembros = dto.manterMembros ?? true;
    // Membro que saiu da equipe nao volta pela copia.
    const membros = manterMembros
      ? await this.membrosValidos(
          accountId,
          origem.collaborators.map((c) => c.userId),
        )
      : [];
    const copia = await this.prisma.demanda.create({
      data: {
        accountId,
        titulo: dto.titulo.trim(),
        tipo: origem.tipo,
        descricao: origem.descricao,
        clienteId: origem.clienteId,
        responsavelId: manterMembros ? origem.responsavelId : null,
        prazo: origem.prazo,
        prazoConcluido: origem.prazoConcluido,
        capaCor: origem.capaCor,
        etapa: destino.etapa,
        quadroId: destino.quadroId,
        colunaId: destino.colunaId,
        posicao: destino.posicao,
        ...(manterEtiquetas && origem.labels.length
          ? { labels: { create: origem.labels.map((l) => ({ labelId: l.labelId })) } }
          : {}),
        ...(membros.length
          ? { collaborators: { create: membros.map((userId) => ({ userId })) } }
          : {}),
        ...(manterChecklist && origem.checklist.length
          ? {
              checklist: {
                create: origem.checklist.map((c) => ({
                  texto: c.texto,
                  concluido: c.concluido,
                  posicao: c.posicao,
                })),
              },
            }
          : {}),
      },
      select: DEMANDA_SELECT,
    });
    await this.registrar(copia.id, autorId, 'copiou', { de: origem.titulo });
    await this.notifications.notifyDemanda(
      accountId,
      copia.id,
      [copia.responsavelId, ...copia.collaborators.map((c) => c.userId)],
      autorId,
    );
    return toDto(copia);
  }

  /** Um card (ativo ou arquivado) - usado pelo link de notificacao para achar o quadro. */
  async findOne(accountId: string, id: string) {
    await this.getOwned(accountId, id);
    return this.findOneDto(id);
  }

  private async findOneDto(id: string) {
    const demanda = await this.prisma.demanda.findUniqueOrThrow({
      where: { id },
      select: DEMANDA_SELECT,
    });
    return toDto(demanda);
  }

  /* ------------------------------ comentarios ------------------------------ */

  async listComentarios(accountId: string, demandaId: string) {
    await this.getOwned(accountId, demandaId);
    return this.prisma.demandaComentario.findMany({
      where: { demandaId },
      orderBy: { criadoEm: 'desc' },
      select: COMENTARIO_SELECT,
    });
  }

  async addComentario(
    accountId: string,
    demandaId: string,
    dto: CreateComentarioDto,
    autorId: string,
  ) {
    await this.getOwned(accountId, demandaId);
    const mencionados = await this.membrosValidos(
      accountId,
      dto.mencionados ?? [],
    );
    const comentario = await this.prisma.demandaComentario.create({
      data: { demandaId, autorId, texto: dto.texto.trim(), mencionados },
      select: COMENTARIO_SELECT,
    });
    const card = await this.prisma.demanda.findUniqueOrThrow({
      where: { id: demandaId },
      select: {
        responsavelId: true,
        collaborators: { select: { userId: true } },
      },
    });
    await this.notifications.notifyComentarioDemanda(
      accountId,
      demandaId,
      comentario.id,
      mencionados,
      [card.responsavelId, ...card.collaborators.map((c) => c.userId)],
      autorId,
    );
    return comentario;
  }

  /** So o autor edita o proprio comentario. */
  async updateComentario(
    accountId: string,
    demandaId: string,
    comentarioId: string,
    dto: UpdateComentarioDto,
    user: { id: string },
  ) {
    const comentario = await this.getOwnedComentario(
      accountId,
      demandaId,
      comentarioId,
    );
    if (comentario.autorId !== user.id) {
      throw new ForbiddenException('So quem escreveu pode editar o comentario');
    }
    return this.prisma.demandaComentario.update({
      where: { id: comentarioId },
      data: { texto: dto.texto.trim(), editadoEm: new Date() },
      select: COMENTARIO_SELECT,
    });
  }

  /** Autor apaga o proprio; o owner pode apagar qualquer um. */
  async removeComentario(
    accountId: string,
    demandaId: string,
    comentarioId: string,
    user: { id: string; role: UserRole },
  ) {
    const comentario = await this.getOwnedComentario(
      accountId,
      demandaId,
      comentarioId,
    );
    if (comentario.autorId !== user.id && user.role !== UserRole.owner) {
      throw new ForbiddenException('Sem permissao para apagar este comentario');
    }
    await this.prisma.demandaComentario.delete({ where: { id: comentarioId } });
    return { deleted: true };
  }

  async listAtividades(accountId: string, demandaId: string) {
    await this.getOwned(accountId, demandaId);
    return this.prisma.demandaAtividade.findMany({
      where: { demandaId },
      orderBy: { criadoEm: 'desc' },
      take: 200,
      select: {
        id: true,
        tipo: true,
        dados: true,
        criadoEm: true,
        autor: AUTOR_SELECT,
      },
    });
  }

  /* -------------------------------- historico ------------------------------- */

  /** Nunca derruba a acao principal: historico e informativo. */
  private async registrar(
    demandaId: string,
    autorId: string | undefined,
    tipo: string,
    dados?: Prisma.InputJsonValue,
  ) {
    try {
      await this.prisma.demandaAtividade.create({
        data: { demandaId, autorId: autorId ?? null, tipo, dados },
      });
    } catch {
      // ignora: o card ja foi salvo
    }
  }

  private async registrarEdicao(
    demandaId: string,
    autorId: string,
    antes: {
      titulo: string;
      prazo: Date | null;
      prazoConcluido: boolean;
      responsavelId: string | null;
    },
    depois: Record<string, unknown>,
  ) {
    const depoisPrazo = (depois.prazo as Date | null) ?? null;
    if (antes.titulo !== depois.titulo) {
      await this.registrar(demandaId, autorId, 'titulo', {
        de: antes.titulo,
        para: depois.titulo as string,
      });
    }
    if (antes.responsavelId !== depois.responsavelId) {
      await this.registrar(demandaId, autorId, 'responsavel', {
        para: (depois.responsavel as { nome: string } | null)?.nome ?? null,
      });
    }
    if ((antes.prazo?.getTime() ?? null) !== (depoisPrazo?.getTime() ?? null)) {
      await this.registrar(demandaId, autorId, 'prazo', {
        para: depoisPrazo ? depoisPrazo.toISOString() : null,
      });
    }
    if (!antes.prazoConcluido && depois.prazoConcluido === true) {
      await this.registrar(demandaId, autorId, 'prazo_cumprido');
    }
  }

  /** Filtra para membros ativos (owner/editor) da conta; ignora o resto. */
  private async membrosValidos(accountId: string, ids: string[]) {
    if (ids.length === 0) return [];
    const membros = await this.prisma.membership.findMany({
      where: {
        accountId,
        userId: { in: ids },
        role: { in: [UserRole.owner, UserRole.editor] },
        status: UserStatus.ativo,
      },
      select: { userId: true },
    });
    const ok = new Set(membros.map((m) => m.userId));
    return ids.filter((id) => ok.has(id));
  }

  private async getOwnedComentario(
    accountId: string,
    demandaId: string,
    comentarioId: string,
  ) {
    const comentario = await this.prisma.demandaComentario.findFirst({
      where: { id: comentarioId, demandaId, demanda: { accountId } },
      select: { id: true, autorId: true },
    });
    if (!comentario) throw new NotFoundException('Comentario nao encontrado');
    return comentario;
  }

  private async getOwnedChecklistItem(
    accountId: string,
    demandaId: string,
    itemId: string,
  ) {
    const item = await this.prisma.demandaChecklistItem.findFirst({
      where: { id: itemId, demandaId, demanda: { accountId } },
      select: { id: true },
    });
    if (!item) throw new NotFoundException('Item do checklist nao encontrado');
    return item;
  }

  async remove(accountId: string, id: string) {
    await this.getOwned(accountId, id);
    await this.prisma.demanda.delete({ where: { id } });
    return { deleted: true };
  }

  /** Filtro "mesma coluna" para calcular o fim da coluna. */
  private escopoColuna(c: {
    etapa: EtapaProducao;
    quadroId: string | null;
    colunaId: string | null;
  }) {
    return c.quadroId
      ? { quadroId: c.quadroId, colunaId: c.colunaId }
      : { quadroId: null, etapa: c.etapa };
  }

  /**
   * Confere que o quadro (e a coluna, se vier) e da conta; sem coluna,
   * devolve a primeira do quadro.
   */
  private async resolverColuna(
    accountId: string,
    quadroId: string,
    colunaId: string | null | undefined,
  ) {
    const quadro = await this.prisma.quadro.findFirst({
      where: { id: quadroId, accountId },
      select: {
        id: true,
        colunas: { select: { id: true }, orderBy: { posicao: 'asc' } },
      },
    });
    if (!quadro) throw new BadRequestException('quadroId invalido');
    if (colunaId) {
      if (!quadro.colunas.some((c) => c.id === colunaId)) {
        throw new BadRequestException('colunaId nao pertence ao quadro');
      }
      return { quadroId, colunaId };
    }
    const primeira = quadro.colunas[0];
    if (!primeira) throw new BadRequestException('Quadro sem colunas');
    return { quadroId, colunaId: primeira.id };
  }

  private async getOwned(accountId: string, id: string) {
    const demanda = await this.prisma.demanda.findFirst({
      where: { id, accountId },
      select: { id: true },
    });
    if (!demanda) {
      throw new NotFoundException('Demanda nao encontrada');
    }
    return demanda;
  }

  /**
   * clienteId/responsavelId sao opcionais, mas quando enviados precisam
   * pertencer a mesma conta do usuario autenticado (evita vazar/associar
   * dados de outra agencia) - mesmo padrao de RecordingEventsService.
   */
  private async assertRefsBelongToAccount(
    accountId: string,
    dto: Pick<CreateDemandaDto, 'clienteId' | 'responsavelId'>,
  ): Promise<void> {
    if (dto.clienteId) {
      const cliente = await this.prisma.client.findFirst({
        where: { id: dto.clienteId, accountId },
        select: { id: true },
      });
      if (!cliente) {
        throw new BadRequestException('clienteId invalido');
      }
    }
    if (dto.responsavelId) {
      const responsavel = await this.prisma.membership.findFirst({
        where: { userId: dto.responsavelId, accountId },
        select: { userId: true },
      });
      if (!responsavel) {
        throw new BadRequestException('responsavelId invalido');
      }
    }
  }

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
}

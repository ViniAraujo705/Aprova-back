import { once } from 'events';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ProcessamentoStatus } from '@prisma/client';
import { Response } from 'express';
import archiver from 'archiver';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { slugify } from '../common/short-id.util';
import { downloadFileName } from '../common/download-file.util';
import { DownloadVideosDto } from './dto/download-videos.dto';
import { signDownloadToken, verifyDownloadToken } from './download-token.util';

/** Validade do link temporario do zip. */
const TOKEN_TTL_SECONDS = 15 * 60;

/**
 * Por que o video pedido ficou de fora do zip:
 * - `not_found`: o link nao existe ou nao e deste projeto
 * - `processing`: arquivo ainda indisponivel e o video esta em processamento
 * - `unavailable`: arquivo original nao esta acessivel no storage
 */
export type SkipReason = 'not_found' | 'processing' | 'unavailable';

export interface SkippedVideo {
  link: string;
  reason: SkipReason;
}

interface ZipEntry {
  videoId: string;
  key: string;
  name: string;
  sizeBytes: number | null;
}

/**
 * Download em lote da galeria publica: em vez de o cliente disparar um
 * download por video (o Safari do iPhone bloqueia varios downloads a partir
 * de um unico toque), a API monta um unico zip com os videos selecionados.
 *
 * O fluxo tem duas etapas para caber num toque so no celular:
 *   1. POST .../download valida a selecao e devolve um link temporario
 *      assinado + a lista do que ficou de fora;
 *   2. GET .../download/:token transmite o zip como download direto.
 *
 * O zip nunca e materializado (nem em disco, nem em memoria, nem no R2): os
 * objetos sao lidos do storage e costurados no corpo da resposta em
 * streaming, sem compressao (video ja e um formato comprimido - comprimir de
 * novo so gastaria CPU do container).
 */
@Injectable()
export class ProjectDownloadService {
  private readonly logger = new Logger(ProjectDownloadService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Valida a selecao e devolve o link temporario do zip. `url` vem null
   * quando nenhum dos videos pedidos esta disponivel - nesse caso o motivo
   * de cada um esta em `skipped`.
   */
  async prepare(linkPublico: string, dto: DownloadVideosDto, baseUrl: string) {
    const project = await this.resolveProject(linkPublico);

    // Mantem a ordem pedida pelo cliente e ignora repeticoes do mesmo link.
    const links = [...new Set(dto.videoLinks)];
    const videos = await this.prisma.video.findMany({
      // Escopo do projeto do link publico: um link de video de outro projeto
      // nunca entra no zip, so vira "not_found".
      where: { projectId: project.id, linkPublico: { in: links } },
      select: {
        id: true,
        linkPublico: true,
        nomeArquivo: true,
        urlStorage: true,
        statusProcessamento: true,
      },
    });
    const byLink = new Map(videos.map((video) => [video.linkPublico, video]));

    // Disponibilidade real do original no R2 (HEAD em paralelo): e o unico
    // sinal confiavel - status_processamento fala do pipeline de thumbnail/
    // versao otimizada, nao do arquivo original.
    const availability = new Map(
      await Promise.all(
        videos.map(
          async (video) =>
            [video.id, await this.locateOriginal(video.urlStorage)] as const,
        ),
      ),
    );

    const entries: ZipEntry[] = [];
    const skipped: SkippedVideo[] = [];
    const usedNames = new Set<string>();

    for (const link of links) {
      const video = byLink.get(link);
      if (!video) {
        skipped.push({ link, reason: 'not_found' });
        continue;
      }
      const original = availability.get(video.id);
      if (!original) {
        skipped.push({
          link,
          reason:
            video.statusProcessamento === ProcessamentoStatus.processando
              ? 'processing'
              : 'unavailable',
        });
        continue;
      }
      entries.push({
        videoId: video.id,
        key: original.key,
        name: this.zipEntryName(video.nomeArquivo, original.key, usedNames),
        sizeBytes: original.sizeBytes,
      });
    }

    const filename = this.zipFilename(project.nome);
    if (entries.length === 0) {
      return {
        url: null,
        filename,
        totalVideos: 0,
        totalBytes: 0,
        expiresIn: TOKEN_TTL_SECONDS,
        skipped,
      };
    }

    const token = signDownloadToken({
      p: project.id,
      v: entries.map((entry) => entry.videoId),
      e: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
    });

    return {
      url: `${baseUrl}/${token}`,
      filename,
      totalVideos: entries.length,
      totalBytes: entries.reduce(
        (total, entry) => total + (entry.sizeBytes ?? 0),
        0,
      ),
      expiresIn: TOKEN_TTL_SECONDS,
      skipped,
    };
  }

  /**
   * Transmite o zip do token direto na resposta. Como os bytes comecam a
   * sair antes de sabermos se todos os objetos estao integros, uma falha no
   * meio do caminho so pode derrubar a conexao (o cliente ve um download
   * interrompido) - nao da mais para trocar por um JSON de erro.
   */
  async streamZip(
    linkPublico: string,
    token: string,
    res: Response,
  ): Promise<void> {
    const payload = verifyDownloadToken(token);
    const project = await this.resolveProject(linkPublico);
    // O token so vale para o projeto em que foi emitido - nao adianta
    // reaproveitar um token valido em outro link publico.
    if (!payload || payload.p !== project.id) {
      throw new NotFoundException('Link de download expirado ou invalido');
    }

    const videos = await this.prisma.video.findMany({
      where: { id: { in: payload.v }, projectId: project.id },
      select: { id: true, nomeArquivo: true, urlStorage: true },
    });
    const byId = new Map(videos.map((video) => [video.id, video]));

    const usedNames = new Set<string>();
    const entries: ZipEntry[] = [];
    for (const videoId of payload.v) {
      const video = byId.get(videoId);
      const key = video
        ? this.storage.keyFromPublicUrl(video.urlStorage)
        : null;
      if (!video || !key) {
        continue;
      }
      entries.push({
        videoId,
        key,
        name: this.zipEntryName(video.nomeArquivo, key, usedNames),
        sizeBytes: null,
      });
    }
    if (entries.length === 0) {
      throw new NotFoundException('Nenhum video disponivel para download');
    }

    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${this.zipFilename(project.nome)}"`,
      // Link expira em minutos: nao pode ficar em cache de proxy/navegador.
      'Cache-Control': 'no-store',
    });

    // store: sem deflate. Video ja vem comprimido - reprocessar so gastaria
    // CPU do container web sem reduzir o tamanho do arquivo.
    const archive = archiver('zip', { store: true });
    archive.pipe(res);

    // Cliente fechou a aba / perdeu a conexao: aborta para nao continuar
    // baixando o resto dos objetos do R2 a toa.
    const onClose = () => archive.abort();
    res.on('close', onClose);

    try {
      for (const entry of entries) {
        const { stream } = await this.storage.getObjectStream(entry.key);
        archive.append(stream, { name: entry.name });
        // Um objeto por vez: se todos os streams do R2 fossem abertos de uma
        // vez, os ultimos ficariam ociosos ate chegar a sua vez no zip e o
        // socket estouraria o timeout antes de ser lido.
        await once(archive, 'entry');
      }
      await archive.finalize();
    } catch (err) {
      this.logger.error(
        `Falha ao montar o zip do projeto ${project.id}`,
        err instanceof Error ? err.stack : String(err),
      );
      archive.abort();
      res.destroy();
    } finally {
      res.off('close', onClose);
    }
  }

  private async resolveProject(linkPublico: string) {
    const project = await this.prisma.project.findUnique({
      where: { linkPublico },
      select: { id: true, nome: true },
    });
    if (!project) {
      throw new NotFoundException('Projeto nao encontrado');
    }
    return project;
  }

  /** Nome do zip entregue ao cliente (ex.: "entrega-campanha-verao.zip"). */
  private zipFilename(nomeProjeto: string): string {
    return `entrega-${slugify(nomeProjeto, 'projeto')}.zip`;
  }

  /**
   * Confirma que o arquivo original existe no bucket e devolve a key + o
   * tamanho. Null quando a URL nao aponta para o nosso bucket (video de
   * exemplo do onboarding, hospedado fora) ou o objeto sumiu.
   */
  private async locateOriginal(
    urlStorage: string,
  ): Promise<{ key: string; sizeBytes: number | null } | null> {
    const key = this.storage.keyFromPublicUrl(urlStorage);
    if (!key) {
      return null;
    }
    try {
      const head = await this.storage.headObject(key);
      return head.exists ? { key, sizeBytes: head.sizeBytes } : null;
    } catch (err) {
      this.logger.warn(
        `Falha ao verificar o objeto ${key} no storage: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }

  /**
   * Nome do arquivo dentro do zip a partir do titulo do video: sem separador
   * de diretorio (o zip nao deve criar pastas), com a extensao do arquivo
   * original e com sufixo numerico quando dois videos do mesmo projeto tem o
   * mesmo titulo.
   */
  private zipEntryName(
    nomeArquivo: string,
    key: string,
    usedNames: Set<string>,
  ): string {
    const name = downloadFileName(nomeArquivo, key);
    const ext = name.slice(name.lastIndexOf('.'));
    const base = name.slice(0, name.length - ext.length);

    let unique = name;
    let suffix = 2;
    while (usedNames.has(unique.toLowerCase())) {
      unique = `${base} (${suffix++})${ext}`;
    }
    usedNames.add(unique.toLowerCase());
    return unique;
  }
}

import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Upload } from '@aws-sdk/lib-storage';

export interface PresignedUpload {
  uploadUrl: string;
  key: string;
  publicUrl: string;
  expiresIn: number;
}

/**
 * Encapsula o acesso ao Cloudflare R2 (S3-compatible).
 * O arquivo NAO passa pelo servidor: geramos uma presigned URL e o
 * cliente faz o PUT direto no bucket.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicUrl: string;
  private readonly urlExpiresIn = 60 * 10; // 10 minutos
  // Download do cliente final: a expiracao vale para o INICIO da request, o
  // download em si pode passar disso. 15 min dao folga para o cliente tocar
  // no botao, a conexao do celular oscilar e o Safari retomar.
  private readonly downloadExpiresIn = 60 * 15;

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.get<string>('R2_BUCKET_NAME') as string;
    this.publicUrl = (this.config.get<string>('R2_PUBLIC_URL') ?? '').replace(
      /\/$/,
      '',
    );

    this.client = new S3Client({
      region: 'auto',
      endpoint: this.config.get<string>('R2_ENDPOINT'),
      credentials: {
        accessKeyId: this.config.get<string>('R2_ACCESS_KEY_ID') as string,
        secretAccessKey: this.config.get<string>(
          'R2_SECRET_ACCESS_KEY',
        ) as string,
      },
    });
  }

  /**
   * Gera uma URL assinada para upload direto (PUT) no R2.
   * A key gerada usa um prefixo aleatorio para evitar colisao de nomes.
   */
  async createPresignedUpload(
    fileName: string,
    contentType: string,
  ): Promise<PresignedUpload> {
    const key = this.buildKey(fileName);

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(this.client, command, {
      expiresIn: this.urlExpiresIn,
    });

    return {
      uploadUrl,
      key,
      publicUrl: `${this.publicUrl}/${key}`,
      expiresIn: this.urlExpiresIn,
    };
  }

  /**
   * Gera uma URL assinada de upload para um prefixo/pasta especifico
   * (ex.: 'branding' para o logo da agencia). Reaproveita a mesma
   * mecanica de presigned URL usada no upload de video.
   */
  async createPresignedUploadIn(
    folder: string,
    fileName: string,
    contentType: string,
  ): Promise<PresignedUpload> {
    const key = this.buildKey(fileName, folder);

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(this.client, command, {
      expiresIn: this.urlExpiresIn,
    });

    return {
      uploadUrl,
      key,
      publicUrl: `${this.publicUrl}/${key}`,
      expiresIn: this.urlExpiresIn,
    };
  }

  /**
   * Gera uma URL assinada de leitura (GET) que forca o navegador a SALVAR o
   * arquivo em vez de abrir inline, e com o Content-Type correto.
   *
   * Existe porque a URL publica do bucket depende de dois detalhes fora do
   * nosso controle: o Content-Type que o dispositivo declarou no upload
   * direto (um iPhone pode subir .MOV como application/octet-stream) e o
   * CORS do bucket - sem ele o front nao consegue transformar a resposta em
   * blob para forcar o download. Aqui os dois cabecalhos vem assinados na
   * propria URL, entao o link pode ser aberto direto (window.location /
   * <a href>), sem fetch e sem CORS, que e o unico caminho confiavel no
   * Safari do iPhone.
   */
  async createPresignedDownload(
    key: string,
    fileName: string,
    contentType?: string,
  ): Promise<{ url: string; expiresIn: number }> {
    // Nome ASCII no filename= (compatibilidade) + filename*= em UTF-8 para
    // preservar acentos nos navegadores que suportam (RFC 5987).
    const asciiName =
      fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_') || 'video';
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      ...(contentType ? { ResponseContentType: contentType } : {}),
    });

    const url = await getSignedUrl(this.client, command, {
      expiresIn: this.downloadExpiresIn,
    });
    return { url, expiresIn: this.downloadExpiresIn };
  }

  /**
   * Baixa um objeto do R2 e grava em um arquivo local (usado pelo
   * worker de processamento, que precisa do binario para o ffmpeg).
   */
  async downloadToFile(key: string, destPath: string): Promise<void> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    const response = await this.client.send(command);
    const body = response.Body as Readable;
    await pipeline(body, createWriteStream(destPath));
  }

  /**
   * Abre um objeto do R2 como stream, sem tocar o disco nem carregar o
   * conteudo em memoria. Usado pelo download em lote, que costura varios
   * objetos direto no zip enviado ao cliente.
   */
  async getObjectStream(
    key: string,
  ): Promise<{ stream: Readable; sizeBytes: number | null }> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    return {
      stream: response.Body as Readable,
      sizeBytes: response.ContentLength ?? null,
    };
  }

  /**
   * Envia um arquivo local para o R2 sob a key informada e retorna a
   * URL publica. Usado para thumbnail e versao otimizada geradas no worker.
   * Faz streaming direto do disco (multipart via lib-storage) em vez de
   * carregar o arquivo inteiro em memoria, importante para os videos
   * otimizados que podem chegar a centenas de MB.
   */
  async uploadFile(
    key: string,
    filePath: string,
    contentType: string,
  ): Promise<string> {
    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: createReadStream(filePath),
        ContentType: contentType,
        // Arquivos gerados pelo worker sao imutaveis (key unica por upload)
        CacheControl: 'public, max-age=31536000, immutable',
      },
      queueSize: 4,
    });
    await upload.done();
    return `${this.publicUrl}/${key}`;
  }

  /**
   * Verifica se um objeto existe no R2 e retorna seu tamanho, sem baixar
   * o conteudo. Usado para validar uploads diretos do cliente antes de
   * enfileirar o processamento (o cliente pode reportar um urlStorage de
   * um PUT que falhou silenciosamente).
   */
  async headObject(
    key: string,
  ): Promise<{ exists: boolean; sizeBytes: number | null }> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return { exists: true, sizeBytes: result.ContentLength ?? null };
    } catch (err) {
      const typedErr = err as {
        name?: string;
        $metadata?: { httpStatusCode?: number };
      };
      const status = typedErr?.$metadata?.httpStatusCode;
      if (
        typedErr?.name === 'NotFound' ||
        typedErr?.name === 'NoSuchKey' ||
        status === 404
      ) {
        return { exists: false, sizeBytes: null };
      }
      throw err;
    }
  }

  /**
   * Remove um objeto do R2 (usado para descartar uploads que excedem o
   * tamanho maximo permitido).
   */
  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  /**
   * Deriva a key do R2 a partir da URL publica (o inverso de publicUrl).
   * Retorna null se a URL nao pertencer ao dominio publico configurado.
   */
  keyFromPublicUrl(url: string): string | null {
    if (this.publicUrl && url.startsWith(`${this.publicUrl}/`)) {
      return url.slice(this.publicUrl.length + 1);
    }
    return null;
  }

  /**
   * Key de um objeto no bucket: sanitiza o nome (o titulo do video e texto
   * livre digitado pela agencia - espaco e acento na key viram URL que
   * consumidor nenhum alem do navegador normaliza) e prefixa com timestamp +
   * bytes aleatorios, de modo que cada upload produza uma key nova. E isso
   * que autoriza o `CacheControl: immutable` de `uploadFile`: um
   * reprocessamento nunca sobrescreve um objeto ja distribuido no CDN.
   */
  buildKey(fileName: string, folder = 'videos'): string {
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const unique = `${Date.now()}-${randomBytes(8).toString('hex')}`;
    return `${folder}/${unique}-${safeName}`;
  }
}

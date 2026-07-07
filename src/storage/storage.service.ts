import { createWriteStream } from 'fs';
import { readFile } from 'fs/promises';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

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
   * Envia um arquivo local para o R2 sob a key informada e retorna a
   * URL publica. Usado para thumbnail e versao otimizada geradas no worker.
   */
  async uploadFile(
    key: string,
    filePath: string,
    contentType: string,
  ): Promise<string> {
    const body = await readFile(filePath);
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    });
    await this.client.send(command);
    return `${this.publicUrl}/${key}`;
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

  private buildKey(fileName: string, folder = 'videos'): string {
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    return `${folder}/${unique}-${safeName}`;
  }
}

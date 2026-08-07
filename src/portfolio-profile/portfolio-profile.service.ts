import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { createWithUniqueRandomField } from '../common/short-id.util';
import { UpdatePortfolioProfileDto } from './dto/update-portfolio-profile.dto';
import { PortfolioProfilePhotoUploadUrlDto } from './dto/photo-upload-url.dto';

const PROFILE_SELECT = { fotoUrl: true, linkHub: true } as const;

@Injectable()
export class PortfolioProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Perfil do hub publico (ver PublicPortfolioHubController). linkHub e
   * gerado preguicosamente aqui na primeira leitura - nunca null na
   * resposta da API, mesmo antes do owner nunca ter aberto a tela.
   */
  async getOrCreate(accountId: string) {
    const existing = await this.prisma.portfolioProfile.findUnique({
      where: { accountId },
      select: PROFILE_SELECT,
    });
    if (existing) {
      return existing;
    }

    try {
      return await createWithUniqueRandomField('linkHub', (linkHub) =>
        this.prisma.portfolioProfile.create({
          data: { accountId, linkHub },
          select: PROFILE_SELECT,
        }),
      );
    } catch (err) {
      // Corrida entre duas leituras concorrentes (ex.: duas abas abrindo o
      // dashboard ao mesmo tempo) - a segunda so relê a linha ja criada.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        (err.meta?.target as string[] | undefined)?.includes('accountId')
      ) {
        return this.prisma.portfolioProfile.findUniqueOrThrow({
          where: { accountId },
          select: PROFILE_SELECT,
        });
      }
      throw err;
    }
  }

  async update(accountId: string, dto: UpdatePortfolioProfileDto) {
    await this.getOrCreate(accountId);
    return this.prisma.portfolioProfile.update({
      where: { accountId },
      data: dto,
      select: PROFILE_SELECT,
    });
  }

  createPhotoUploadUrl(dto: PortfolioProfilePhotoUploadUrlDto) {
    return this.storage.createPresignedUploadIn(
      'portfolio-profile',
      dto.nomeArquivo,
      dto.contentType,
    );
  }
}

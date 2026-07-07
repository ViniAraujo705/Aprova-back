import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { UpdateBrandingDto } from './dto/update-branding.dto';
import { LogoUploadUrlDto } from './dto/logo-upload-url.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Gera uma presigned URL para o upload do logo da agência,
   * reaproveitando a mesma mecânica de upload do R2 usada nos vídeos
   * (pasta dedicada `branding`).
   */
  createLogoUploadUrl(dto: LogoUploadUrlDto) {
    return this.storage.createPresignedUploadIn(
      'branding',
      dto.nomeArquivo,
      dto.contentType,
    );
  }

  /**
   * Atualiza o branding (nome da agência + logo + cor de destaque).
   * `nome` aqui e sempre o nome do USUARIO (owner) - o nome da AGENCIA
   * (Account.nomeAgencia, o que `dto.nome` atualiza) volta a parte, em
   * `nomeAgencia`, para nao colidir com o nome pessoal do owner.
   */
  async updateBranding(
    userId: string,
    accountId: string,
    dto: UpdateBrandingDto,
  ) {
    const [user, account] = await Promise.all([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          ...(dto.logoUrl !== undefined ? { logoUrl: dto.logoUrl } : {}),
          ...(dto.corDestaque !== undefined
            ? { corDestaque: dto.corDestaque }
            : {}),
        },
        select: { id: true, nome: true, logoUrl: true, corDestaque: true },
      }),
      dto.nome !== undefined
        ? this.prisma.account.update({
            where: { id: accountId },
            data: { nomeAgencia: dto.nome },
            select: { nomeAgencia: true },
          })
        : this.prisma.account.findUniqueOrThrow({
            where: { id: accountId },
            select: { nomeAgencia: true },
          }),
    ]);
    return { ...user, nomeAgencia: account.nomeAgencia };
  }
}

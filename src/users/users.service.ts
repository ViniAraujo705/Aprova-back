import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { toMemberDto } from '../common/dto/team-role.util';
import { UpdateBrandingDto } from './dto/update-branding.dto';
import { LogoUploadUrlDto } from './dto/logo-upload-url.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { PhotoUploadUrlDto } from './dto/photo-upload-url.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Atualiza os dados do proprio usuario logado (nome/email/foto).
   * Nao exige reautenticacao para trocar o email — o JWT identifica o
   * usuario pelo id (ver JwtStrategy), entao a troca nao invalida a sessao.
   */
  async updateMe(userId: string, dto: UpdateMeDto) {
    if (dto.email !== undefined) {
      const existing = await this.prisma.user.findUnique({
        where: { email: dto.email },
        select: { id: true },
      });
      if (existing && existing.id !== userId) {
        throw new ConflictException('Ja existe uma conta com este email');
      }
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.nome !== undefined ? { nome: dto.nome } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.fotoUrl !== undefined ? { avatarUrl: dto.fotoUrl } : {}),
      },
      select: {
        id: true,
        nome: true,
        email: true,
        role: true,
        status: true,
        accountId: true,
        avatarUrl: true,
        criadoEm: true,
      },
    });

    return toMemberDto(user);
  }

  /**
   * Gera uma presigned URL para o upload da foto de perfil do proprio
   * usuario (avatar pessoal, nao aparece pro cliente), reaproveitando a
   * mesma mecanica do logo da agencia so que na pasta `avatars`.
   */
  createPhotoUploadUrl(dto: PhotoUploadUrlDto) {
    return this.storage.createPresignedUploadIn(
      'avatars',
      dto.nomeArquivo,
      dto.contentType,
    );
  }

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

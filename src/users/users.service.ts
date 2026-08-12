import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { PlansService } from '../plans/plans.service';
import { toMemberDto } from '../common/dto/team-role.util';
import { resolveOwnerBranding } from '../common/account-branding.util';
import { UpdateBrandingDto } from './dto/update-branding.dto';
import { LogoUploadUrlDto } from './dto/logo-upload-url.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { PhotoUploadUrlDto } from './dto/photo-upload-url.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly plans: PlansService,
  ) {}

  /**
   * Dados do proprio usuario logado + branding (white label) da agencia.
   * Usado pelo painel para restaurar logo/cor/nome da agencia sem depender
   * da resposta do login (ex.: apos um refresh de pagina).
   */
  async me(userId: string, accountId: string) {
    const [user, account, ownerBranding] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
          id: true,
          nome: true,
          email: true,
          role: true,
          status: true,
          avatarUrl: true,
          criadoEm: true,
          emailVerificadoEm: true,
        },
      }),
      this.prisma.account.findUniqueOrThrow({
        where: { id: accountId },
        select: { nomeAgencia: true },
      }),
      // Branding (white label) mora no User do OWNER da conta, nao no
      // usuario logado (que pode ser um editor) - ver resolveOwnerBranding.
      resolveOwnerBranding(this.prisma, accountId),
    ]);

    const { emailVerificadoEm, ...rest } = user;
    return {
      ...toMemberDto(rest),
      // accountId nao mora mais no User (ver Membership) - vem do contexto
      // da conta ativa do token (AuthUser.accountId), nao de uma coluna.
      accountId,
      logoUrl: ownerBranding.logoUrl,
      corDestaque: ownerBranding.corDestaque,
      nomeAgencia: account.nomeAgencia,
      branding: {
        logoUrl: ownerBranding.logoUrl,
        corDestaque: ownerBranding.corDestaque,
        nomeAgencia: account.nomeAgencia,
      },
      emailVerificado: Boolean(emailVerificadoEm),
    };
  }

  /**
   * Atualiza os dados do proprio usuario logado (nome/email/foto).
   * Nao exige reautenticacao para trocar o email — o JWT identifica o
   * usuario pelo id (ver JwtStrategy), entao a troca nao invalida a sessao.
   */
  async updateMe(userId: string, accountId: string, dto: UpdateMeDto) {
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
        // Trocar o email invalida a confirmacao anterior - o novo endereco
        // ainda nao foi verificado. Usuario pode confirmar de novo via
        // POST /auth/resend-confirmation.
        ...(dto.email !== undefined
          ? { email: dto.email, emailVerificadoEm: null }
          : {}),
        ...(dto.fotoUrl !== undefined ? { avatarUrl: dto.fotoUrl } : {}),
      },
      select: {
        id: true,
        nome: true,
        email: true,
        role: true,
        status: true,
        avatarUrl: true,
        criadoEm: true,
        emailVerificadoEm: true,
      },
    });

    const { emailVerificadoEm, ...rest } = user;
    return {
      ...toMemberDto(rest),
      accountId,
      emailVerificado: Boolean(emailVerificadoEm),
    };
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
    if (dto.logoUrl !== undefined || dto.corDestaque !== undefined) {
      await this.plans.assertFeature(accountId, 'whiteLabel');
    }

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

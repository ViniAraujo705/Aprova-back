import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleDriveOAuthService } from './google-drive-oauth.service';

@Injectable()
export class GoogleDriveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly oauth: GoogleDriveOAuthService,
  ) {}

  async listItems(
    userId: string,
    options: { q?: string; parentId?: string; pageToken?: string },
  ) {
    const connection = await this.prisma.googleDriveConnection.findUnique({
      where: { userId },
    });
    if (!connection) {
      throw new BadRequestException(
        'Conecte o Google Drive antes de navegar pelos arquivos',
      );
    }
    const accessToken = await this.oauth.getValidAccessToken(
      connection.refreshTokenEnc,
    );
    return this.oauth.listItems(accessToken, options);
  }

  async linkToProject(
    accountId: string,
    projectId: string,
    userId: string,
    googleFileId: string,
  ) {
    const connection = await this.prisma.googleDriveConnection.findUnique({
      where: { userId },
    });
    if (!connection) {
      throw new BadRequestException(
        'Conecte o Google Drive antes de vincular um item',
      );
    }
    const accessToken = await this.oauth.getValidAccessToken(
      connection.refreshTokenEnc,
    );
    const item = await this.oauth.getItem(accessToken, googleFileId);
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, accountId },
      select: { id: true },
    });
    if (!project) throw new NotFoundException('Projeto nao encontrado');

    return this.prisma.projectGoogleDriveItem.upsert({
      where: { projectId_googleFileId: { projectId, googleFileId: item.id } },
      create: {
        projectId,
        linkedByUserId: userId,
        googleFileId: item.id,
        nome: item.name,
        mimeType: item.mimeType,
        isFolder: item.isFolder,
        webViewLink: item.webViewLink,
      },
      update: {
        nome: item.name,
        mimeType: item.mimeType,
        isFolder: item.isFolder,
        webViewLink: item.webViewLink,
      },
    });
  }

  async listProjectItems(accountId: string, projectId: string) {
    await this.assertProject(accountId, projectId);
    return this.prisma.projectGoogleDriveItem.findMany({
      where: { projectId },
      orderBy: { criadoEm: 'desc' },
      select: {
        id: true,
        googleFileId: true,
        nome: true,
        mimeType: true,
        isFolder: true,
        webViewLink: true,
        criadoEm: true,
        linkedByUser: { select: { id: true, nome: true } },
      },
    });
  }

  async unlinkFromProject(
    accountId: string,
    projectId: string,
    itemId: string,
  ) {
    await this.assertProject(accountId, projectId);
    const deleted = await this.prisma.projectGoogleDriveItem.deleteMany({
      where: { id: itemId, projectId },
    });
    if (!deleted.count)
      throw new NotFoundException('Item do Google Drive nao encontrado');
    return { deleted: true };
  }

  private async assertProject(
    accountId: string,
    projectId: string,
  ): Promise<void> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, accountId },
      select: { id: true },
    });
    if (!project) throw new NotFoundException('Projeto nao encontrado');
  }
}

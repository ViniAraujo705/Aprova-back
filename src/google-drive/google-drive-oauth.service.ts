import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { decryptSecret, encryptSecret } from '../common/crypto.util';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

export interface GoogleDriveItem {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string | null;
  isFolder: boolean;
}

interface GoogleDriveFileResponse {
  id?: string;
  name?: string;
  mimeType?: string;
  webViewLink?: string;
  trashed?: boolean;
}

/** OAuth e cliente REST somente de metadados do Google Drive. */
@Injectable()
export class GoogleDriveOAuthService {
  private readonly logger = new Logger(GoogleDriveOAuthService.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;

  constructor(private readonly config: ConfigService) {
    this.clientId = config.get<string>('GOOGLE_DRIVE_CLIENT_ID') ?? '';
    this.clientSecret = config.get<string>('GOOGLE_DRIVE_CLIENT_SECRET') ?? '';
    this.redirectUri = config.get<string>('GOOGLE_DRIVE_REDIRECT_URI') ?? '';
  }

  generateAuthUrl(state: string): string {
    return this.newClient().generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: true,
      scope: [
        'https://www.googleapis.com/auth/drive.metadata.readonly',
        'openid',
        'email',
      ],
      state,
    });
  }

  async exchangeCode(
    code: string,
  ): Promise<{ refreshToken: string; email: string | null }> {
    const client = this.newClient();
    const { tokens } = await client.getToken(code);
    if (!tokens.refresh_token) {
      throw new BadGatewayException(
        'Google nao retornou refresh_token. Revogue o acesso anterior e tente conectar novamente.',
      );
    }
    let email: string | null = null;
    if (tokens.id_token) {
      try {
        const ticket = await client.verifyIdToken({
          idToken: tokens.id_token,
          audience: this.clientId,
        });
        email = ticket.getPayload()?.email ?? null;
      } catch {
        // O e-mail e meramente informativo; a conexao continua valida.
      }
    }
    return { refreshToken: tokens.refresh_token, email };
  }

  encryptRefreshToken(refreshToken: string): string {
    return encryptSecret(refreshToken);
  }

  async getValidAccessToken(refreshTokenEnc: string): Promise<string> {
    const client = this.newClient();
    client.setCredentials({ refresh_token: decryptSecret(refreshTokenEnc) });
    const { token } = await client.getAccessToken();
    if (!token) {
      throw new BadGatewayException(
        'Nao foi possivel obter acesso ao Google Drive',
      );
    }
    return token;
  }

  async revokeToken(refreshTokenEnc: string): Promise<void> {
    try {
      await fetch('https://oauth2.googleapis.com/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `token=${encodeURIComponent(decryptSecret(refreshTokenEnc))}`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'erro desconhecido';
      this.logger.warn(
        `Falha ao revogar token do Google Drive (ignorado): ${message}`,
      );
    }
  }

  async listItems(
    accessToken: string,
    options: { q?: string; parentId?: string; pageToken?: string },
  ): Promise<{ items: GoogleDriveItem[]; nextPageToken: string | null }> {
    const clauses = ['trashed = false'];
    if (options.parentId) {
      clauses.push(`'${this.escapeQueryLiteral(options.parentId)}' in parents`);
    } else if (!options.q) {
      clauses.push("'root' in parents");
    }
    if (options.q)
      clauses.push(`name contains '${this.escapeQueryLiteral(options.q)}'`);
    const params = new URLSearchParams({
      q: clauses.join(' and '),
      pageSize: '50',
      orderBy: 'folder,name_natural',
      fields: 'nextPageToken,files(id,name,mimeType,webViewLink)',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    });
    if (options.pageToken) params.set('pageToken', options.pageToken);
    const result = await this.request<{
      nextPageToken?: string;
      files?: GoogleDriveFileResponse[];
    }>(accessToken, `/files?${params.toString()}`);
    return {
      items: (result.files ?? []).flatMap((file) =>
        this.toItem(file) ? [this.toItem(file)!] : [],
      ),
      nextPageToken: result.nextPageToken ?? null,
    };
  }

  async getItem(
    accessToken: string,
    googleFileId: string,
  ): Promise<GoogleDriveItem> {
    const params = new URLSearchParams({
      fields: 'id,name,mimeType,webViewLink,trashed',
      supportsAllDrives: 'true',
    });
    const file = await this.request<GoogleDriveFileResponse>(
      accessToken,
      `/files/${encodeURIComponent(googleFileId)}?${params.toString()}`,
    );
    const item = this.toItem(file);
    if (!item)
      throw new BadGatewayException(
        'Arquivo do Google Drive nao encontrado ou indisponivel',
      );
    return item;
  }

  private newClient(): OAuth2Client {
    return new OAuth2Client(this.clientId, this.clientSecret, this.redirectUri);
  }

  private toItem(file: GoogleDriveFileResponse): GoogleDriveItem | null {
    if (!file.id || !file.name || !file.mimeType || file.trashed) return null;
    return {
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      webViewLink: file.webViewLink ?? null,
      isFolder: file.mimeType === FOLDER_MIME_TYPE,
    };
  }

  private escapeQueryLiteral(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  private async request<T>(accessToken: string, path: string): Promise<T> {
    try {
      const res = await fetch(`${DRIVE_API_BASE}${path}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const json = await res.json().catch(() => undefined);
      if (!res.ok) {
        throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
      }
      return json as T;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'erro desconhecido';
      this.logger.error(`Google Drive falhou: ${message}`);
      throw new BadGatewayException(
        `Falha ao consultar Google Drive: ${message}`,
      );
    }
  }
}

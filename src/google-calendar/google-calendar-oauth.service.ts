import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { decryptSecret, encryptSecret } from '../common/crypto.util';

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

export interface CalendarEventPayload {
  summary: string;
  description?: string;
  start: { dateTime: string };
  end: { dateTime: string };
  reminders: {
    useDefault: false;
    overrides: Array<{
      method: 'popup';
      minutes: number;
    }>;
  };
}

/**
 * OAuth (auth-code, escopo calendar.events) + REST client fino sobre a
 * Calendar API v3 - sem SDK oficial (googleapis nao esta instalado), so
 * fetch direto, no mesmo estilo do AsaasService (src/billing/asaas). O
 * OAuth2Client (google-auth-library) ja instalado cuida do fluxo de token
 * (troca de code, refresh automatico via getAccessToken).
 */
@Injectable()
export class GoogleCalendarOAuthService {
  private readonly logger = new Logger(GoogleCalendarOAuthService.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;

  constructor(private readonly config: ConfigService) {
    this.clientId = config.get<string>('GOOGLE_CALENDAR_CLIENT_ID') ?? '';
    this.clientSecret =
      config.get<string>('GOOGLE_CALENDAR_CLIENT_SECRET') ?? '';
    this.redirectUri = config.get<string>('GOOGLE_CALENDAR_REDIRECT_URI') ?? '';
  }

  private newClient(): OAuth2Client {
    return new OAuth2Client(this.clientId, this.clientSecret, this.redirectUri);
  }

  generateAuthUrl(state: string): string {
    return this.newClient().generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [
        'https://www.googleapis.com/auth/calendar.events',
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
        'Google nao retornou refresh_token - tente reconectar (revogue o acesso em myaccount.google.com/permissions e conecte de novo).',
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
        email = null;
      }
    }
    return { refreshToken: tokens.refresh_token, email };
  }

  async getValidAccessToken(refreshTokenEnc: string): Promise<string> {
    const client = this.newClient();
    client.setCredentials({ refresh_token: decryptSecret(refreshTokenEnc) });
    const { token } = await client.getAccessToken();
    if (!token) {
      throw new BadGatewayException(
        'Nao foi possivel obter access token do Google Calendar',
      );
    }
    return token;
  }

  encryptRefreshToken(refreshToken: string): string {
    return encryptSecret(refreshToken);
  }

  async revokeToken(refreshTokenEnc: string): Promise<void> {
    try {
      const refreshToken = decryptSecret(refreshTokenEnc);
      await fetch('https://oauth2.googleapis.com/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `token=${encodeURIComponent(refreshToken)}`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'erro desconhecido';
      this.logger.warn(
        `Falha ao revogar token no Google (ignorado): ${message}`,
      );
    }
  }

  async insertEvent(
    accessToken: string,
    payload: CalendarEventPayload,
  ): Promise<{ id: string }> {
    return this.run('criar evento', async () => {
      const result = await this.request<{ id: string }>(
        'POST',
        accessToken,
        '/calendars/primary/events',
        payload,
      );
      if (!result) {
        throw new Error('Google nao retornou o evento criado');
      }
      return result;
    });
  }

  async updateEvent(
    accessToken: string,
    googleEventId: string,
    payload: CalendarEventPayload,
  ): Promise<void> {
    await this.run('atualizar evento', () =>
      this.request(
        'PATCH',
        accessToken,
        `/calendars/primary/events/${googleEventId}`,
        payload,
      ),
    );
  }

  async deleteEvent(accessToken: string, googleEventId: string): Promise<void> {
    await this.run('apagar evento', () =>
      this.request(
        'DELETE',
        accessToken,
        `/calendars/primary/events/${googleEventId}`,
      ),
    );
  }

  private async request<T>(
    method: string,
    accessToken: string,
    path: string,
    body?: unknown,
  ): Promise<T | undefined> {
    const res = await fetch(`${CALENDAR_API_BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    // 404/410: evento ja nao existe do lado do Google (ex.: apagado manualmente) - trata como sucesso.
    if (res.status === 404 || res.status === 410) {
      return undefined;
    }
    const json = await res.json().catch(() => undefined);
    if (!res.ok) {
      const message = json?.error?.message ?? `HTTP ${res.status}`;
      throw new Error(message);
    }
    return json as T;
  }

  private async run<T>(action: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'erro desconhecido';
      this.logger.error(`Google Calendar falhou ao ${action}: ${message}`);
      throw new BadGatewayException(
        `Falha ao ${action} no Google Calendar: ${message}`,
      );
    }
  }
}

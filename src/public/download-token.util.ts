import { createHmac, timingSafeEqual } from 'crypto';
import { deflateRawSync, inflateRawSync } from 'zlib';

/**
 * Conteudo assinado do link temporario de download em lote. Fica todo
 * dentro do token (stateless): nao ha nada guardado no banco nem no Redis,
 * entao o link funciona em qualquer instancia da API e expira sozinho.
 */
export interface DownloadTokenPayload {
  /** id do projeto - amarra o token ao projeto do link publico da rota */
  p: string;
  /** ids dos videos que entram no zip, na ordem em que o cliente pediu */
  v: string[];
  /** expiracao, em epoch de segundos */
  e: number;
}

/**
 * Chave HMAC derivada do JWT_SECRET com dominio proprio: um token de
 * download nunca vale como JWT de sessao (e vice-versa), mesmo os dois
 * saindo do mesmo segredo de ambiente.
 */
function signingKey(): Buffer {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET nao configurada');
  }
  return createHmac('sha256', secret).update('public-download-v1').digest();
}

const sign = (body: string): string =>
  createHmac('sha256', signingKey()).update(body).digest('base64url');

/**
 * Serializa o payload em `<corpo>.<assinatura>`, url-safe. O corpo passa
 * por deflate antes do base64 porque a lista de uuids e bem repetitiva -
 * sem isso o link fica desnecessariamente longo com muitos videos.
 */
export function signDownloadToken(payload: DownloadTokenPayload): string {
  const body = deflateRawSync(Buffer.from(JSON.stringify(payload))).toString(
    'base64url',
  );
  return `${body}.${sign(body)}`;
}

/**
 * Retorna o payload quando a assinatura confere e o token nao expirou;
 * null em qualquer outro caso (formato invalido, assinatura adulterada,
 * corpo corrompido ou vencido).
 */
export function verifyDownloadToken(
  token: string,
): DownloadTokenPayload | null {
  const separator = token.lastIndexOf('.');
  if (separator <= 0) {
    return null;
  }
  const body = token.slice(0, separator);
  const signature = Buffer.from(token.slice(separator + 1), 'base64url');
  const expected = Buffer.from(sign(body), 'base64url');
  if (
    signature.length !== expected.length ||
    !timingSafeEqual(signature, expected)
  ) {
    return null;
  }

  let payload: DownloadTokenPayload;
  try {
    payload = JSON.parse(
      inflateRawSync(Buffer.from(body, 'base64url')).toString(),
    ) as DownloadTokenPayload;
  } catch {
    return null;
  }

  if (
    typeof payload?.p !== 'string' ||
    !Array.isArray(payload?.v) ||
    typeof payload?.e !== 'number' ||
    payload.e * 1000 <= Date.now()
  ) {
    return null;
  }
  return payload;
}

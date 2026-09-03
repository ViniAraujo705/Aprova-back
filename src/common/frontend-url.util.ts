import { ConfigService } from '@nestjs/config';

/**
 * Dominio canonico do frontend, usado para montar todo link que chega ao
 * usuario (convite, reset de senha, confirmacao de e-mail, retorno do
 * checkout, callback das integracoes Google).
 *
 * FRONTEND_URL e a fonte da verdade e vale um dominio so. CORS_ORIGIN aceita
 * varias origens - durante uma troca de dominio as duas convivem, e a
 * primeira da lista nao e necessariamente a canonica. Sem FRONTEND_URL,
 * cai na primeira origem do CORS_ORIGIN (comportamento historico).
 * Retorna null quando nao ha origem utilizavel.
 */
export function resolveFrontendUrl(config: ConfigService): string | null {
  const explicit = (config.get<string>('FRONTEND_URL') ?? '').trim();
  const firstCorsOrigin = (config.get<string>('CORS_ORIGIN') ?? '')
    .split(',')[0]
    .trim();
  const base = explicit || firstCorsOrigin;
  if (!base || base === '*') return null;
  return base.replace(/\/+$/, '');
}

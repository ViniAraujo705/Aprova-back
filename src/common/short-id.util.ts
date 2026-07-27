import { randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';

const ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** Gera um id curto url-safe a partir de bytes aleatorios criptograficos. */
export function generateShortId(length = 10): string {
  const bytes = randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return result;
}

/**
 * Executa `createFn` com um linkPublico curto recem-gerado, tentando
 * novamente em caso de colisao de unicidade (Prisma P2002 no campo
 * linkPublico). Links UUID ja emitidos antes desta mudanca continuam
 * validos - so o gerador usado em novos registros muda.
 */
export async function createWithUniqueLinkPublico<T>(
  createFn: (linkPublico: string) => Promise<T>,
  maxAttempts = 5,
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await createFn(generateShortId());
    } catch (err) {
      const isLinkPublicoCollision =
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        (err.meta?.target as string[] | undefined)?.includes('linkPublico');
      if (!isLinkPublicoCollision || attempt === maxAttempts) {
        throw err;
      }
    }
  }
  throw new Error('Nao foi possivel gerar um linkPublico unico');
}

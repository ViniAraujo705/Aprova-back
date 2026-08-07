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

const isLinkPublicoCollision = (err: unknown): boolean =>
  err instanceof Prisma.PrismaClientKnownRequestError &&
  err.code === 'P2002' &&
  !!(err.meta?.target as string[] | undefined)?.includes('linkPublico');

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
      if (!isLinkPublicoCollision(err) || attempt === maxAttempts) {
        throw err;
      }
    }
  }
  throw new Error('Nao foi possivel gerar um linkPublico unico');
}

// Combining Diacritical Marks (U+0300-U+036F) - o que sobra depois de um
// normalize('NFD') separar uma letra acentuada em base + acento (ex.:
// "ã" -> "a" + U+0303). Removendo essa faixa, sobra so a letra base.
const COMBINING_DIACRITICS = /[̀-ͯ]/g;

/**
 * Slug legivel a partir de um nome (ex.: "Reels de Verão!" -> "reels-de-verao").
 * Remove acentos/pontuacao, colapsa espacos em "-", limita a 40 chars.
 * Cai em "portfolio" se o nome nao render nenhum caractere alfanumerico
 * (ex.: nome so com emoji/simbolos).
 */
export function slugify(input: string, fallback = 'portfolio'): string {
  const slug = input
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return slug || fallback;
}

/**
 * Como `createWithUniqueLinkPublico`, mas usa um slug do `nome` em vez de
 * um id aleatorio - link mais curto e legivel (ex.: /p/reels-de-verao em
 * vez de /p/aB3xQ9kZ2m). Em caso de colisao, tenta de novo com um sufixo
 * curto aleatorio (`reels-de-verao-a1b2`).
 */
export async function createWithUniqueSlugLinkPublico<T>(
  nome: string,
  createFn: (linkPublico: string) => Promise<T>,
  maxAttempts = 5,
): Promise<T> {
  const base = slugify(nome);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const candidate =
      attempt === 1 ? base : `${base}-${generateShortId(4).toLowerCase()}`;
    try {
      return await createFn(candidate);
    } catch (err) {
      if (!isLinkPublicoCollision(err) || attempt === maxAttempts) {
        throw err;
      }
    }
  }
  throw new Error('Nao foi possivel gerar um linkPublico unico');
}

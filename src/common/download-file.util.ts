import { extname } from 'path';

/**
 * Separadores de diretorio e caracteres proibidos em nome de arquivo no
 * Windows/macOS, mais os de controle - o titulo do video e texto livre
 * digitado pela agencia e vira nome de arquivo no disco do cliente.
 */
export const RESERVED_FILENAME_CHARS = /[\p{C}/\\:*?"<>|]/gu;

/**
 * Nome do arquivo entregue ao cliente, a partir do titulo do video e da key
 * do objeto no storage. A extensao vem da key (o titulo pode vir sem
 * extensao, ou com a do original quando o que esta sendo baixado e a versao
 * otimizada .mp4).
 */
export function downloadFileName(nomeArquivo: string, key: string): string {
  const ext = extname(key) || extname(nomeArquivo) || '.mp4';
  let base =
    nomeArquivo.replace(RESERVED_FILENAME_CHARS, '-').trim() || 'video';
  if (base.toLowerCase().endsWith(ext.toLowerCase())) {
    base = base.slice(0, -ext.length);
  }
  return `${base}${ext}`;
}

/**
 * Content-Type correto para a extensao do objeto. O original e enviado
 * direto do browser pro R2 com o tipo que o proprio dispositivo declarou -
 * um iPhone pode subir um .MOV como application/octet-stream, e ai o
 * navegador do cliente se recusa a tocar/baixar o arquivo. Ao assinar a URL
 * de leitura sobrescrevemos o tipo, sem depender do que ficou gravado no
 * objeto.
 */
const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.qt': 'video/quicktime',
  '.webm': 'video/webm',
  '.avi': 'video/x-msvideo',
  '.mpeg': 'video/mpeg',
  '.mpg': 'video/mpeg',
};

export function videoContentTypeFromKey(key: string): string | undefined {
  return CONTENT_TYPE_BY_EXT[extname(key).toLowerCase()];
}

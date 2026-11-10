import { AuthUser } from '../../auth/decorators/current-user.decorator';

// Fila BullMQ do import de arquivos do Google Drive para aprovacao.
export const GOOGLE_DRIVE_IMPORT_QUEUE = 'google-drive-import';
export const GOOGLE_DRIVE_IMPORT_JOB = 'import-file';

/**
 * Tipos que entram no fluxo de aprovacao vindo do Drive. Os mesmos do upload
 * direto (UploadUrlDto). Docs/Planilhas nativos do Google nao tem binario
 * (`alt=media` falha) e ficam de fora.
 */
export const IMPORTABLE_MIME_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-msvideo',
  'video/mpeg',
] as const;

export interface GoogleDriveImportJobData {
  accountId: string;
  /** Quem pediu: o token do Drive usado e o DELE, e o video sai em nome dele. */
  user: AuthUser;
  projectId: string;
  googleFileId: string;
  nomeArquivo: string;
  mimeType: string;
  sizeBytes: number | null;
}

export interface GoogleDriveImportJobResult {
  videoId: string;
}

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { Injectable, Logger } from '@nestjs/common';
import type { TDocumentDefinitions } from 'pdfmake/interfaces';
// vfs com as fontes Roboto embutidas em base64 (0.2.x não distribui .ttf)
import * as vfsFonts from 'pdfmake/build/vfs_fonts';

// O @types/pdfmake da raiz tipa apenas a API de browser (createPdf); o
// runtime em Node é o construtor PdfPrinter. Tipamos localmente o que
// usamos e carregamos via require.
interface PdfKitDoc {
  on(event: 'data', cb: (chunk: Buffer) => void): void;
  on(event: 'end', cb: () => void): void;
  on(event: 'error', cb: (err: Error) => void): void;
  end(): void;
}
interface PdfPrinterInstance {
  createPdfKitDocument(doc: TDocumentDefinitions): PdfKitDoc;
}
type PdfPrinterCtor = new (
  fonts: Record<string, unknown>,
) => PdfPrinterInstance;

const PdfPrinter: PdfPrinterCtor = require('pdfmake');

/**
 * Wrapper genérico do pdfmake para geração de PDF no servidor.
 * As fontes Roboto vêm embutidas no pacote (vfs, base64); materializamos
 * elas uma vez em um diretório temporário para o PdfPrinter (que lê do
 * sistema de arquivos), tornando o serviço self-contained.
 */
@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);
  private readonly printer: PdfPrinterInstance;

  constructor() {
    const fontDir = this.materializeFonts();
    this.printer = new PdfPrinter({
      Roboto: {
        normal: join(fontDir, 'Roboto-Regular.ttf'),
        bold: join(fontDir, 'Roboto-Medium.ttf'),
        italics: join(fontDir, 'Roboto-Italic.ttf'),
        bolditalics: join(fontDir, 'Roboto-MediumItalic.ttf'),
      },
    });
  }

  /** Gera o PDF a partir da definição do documento e resolve com o Buffer. */
  build(docDefinition: TDocumentDefinitions): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = this.printer.createPdfKitDocument(docDefinition);
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err: Error) => reject(err));
      doc.end();
    });
  }

  private materializeFonts(): string {
    const vfs: Record<string, string> =
      (vfsFonts as any).pdfMake?.vfs ?? (vfsFonts as any).vfs ?? vfsFonts;
    const dir = join(tmpdir(), 'aprova-pdf-fonts');
    mkdirSync(dir, { recursive: true });

    for (const file of [
      'Roboto-Regular.ttf',
      'Roboto-Medium.ttf',
      'Roboto-Italic.ttf',
      'Roboto-MediumItalic.ttf',
    ]) {
      const dest = join(dir, file);
      if (!existsSync(dest)) {
        const b64 = vfs[file];
        if (!b64) {
          this.logger.warn(`Fonte ${file} ausente no vfs do pdfmake.`);
          continue;
        }
        writeFileSync(dest, Buffer.from(b64, 'base64'));
      }
    }
    return dir;
  }
}

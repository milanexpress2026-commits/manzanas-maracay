import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

// Legal identity is deployment data, not public source or client-controlled input.
export const documentIssuerSchema = z
  .object({
    legalName: z
      .string()
      .trim()
      .min(2)
      .max(160)
      .regex(/^[^\u0000-\u001f\u007f]+$/),
    rif: z.string().regex(/^[VEJPG]-\d{8}-\d$/),
    address: z
      .string()
      .trim()
      .min(2)
      .max(300)
      .regex(/^[^\u0000-\u001f\u007f]+$/)
      .optional(),
  })
  .strict();
export type DocumentIssuer = z.infer<typeof documentIssuerSchema>;

export async function readDocumentIssuer(): Promise<DocumentIssuer | undefined> {
  // Production already has this private read-only control directory mounted.
  const gate = process.env.MM_PRODUCTION_GATE_FILE;
  if (!gate || process.env.MM_APP_ENV !== 'production') return undefined;
  const filename = path.join(path.dirname(gate), 'document-issuer.json');
  try {
    const content = await fs.readFile(filename, 'utf8');
    if (Buffer.byteLength(content) > 4096) throw new Error('Invalid document issuer');
    return documentIssuerSchema.parse(JSON.parse(content));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    // A malformed configured identity must not silently print another issuer.
    throw new Error('No se pudieron leer los datos del emisor de la nota de entrega.');
  }
}

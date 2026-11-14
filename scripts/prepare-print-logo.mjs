// Deterministic print derivative; preserve the owner's original artwork and transparency.
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
const source = 'apps/web/public/brand/logo-manzanas-maracay.png';
const bytes = await readFile(source);
if (
  createHash('sha256').update(bytes).digest('hex') !==
  '1acb862023ed023ad593f55255502ccdebc3895781a837e2df3ee217566546d1'
)
  throw new Error('El original del logo no coincide con el arte aprobado.');
// Printed at 48 pt: 256px is 384 dpi. No crop, recoloring, or lossy palette reduction.
await sharp(bytes)
  .resize({ width: 256, height: 256, fit: 'inside', withoutEnlargement: true })
  .png({ compressionLevel: 9 })
  .toFile('apps/web/public/brand/logo-manzanas-maracay-print.png');

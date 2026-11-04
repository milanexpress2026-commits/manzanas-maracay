import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function loadLocalEnv() {
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) {
    const owner = crypto.randomBytes(24).toString('hex'),
      app = crypto.randomBytes(24).toString('hex');
    fs.writeFileSync(
      envPath,
      `MM_PG_PASSWORD=${owner}\nMM_APP_PASSWORD=${app}\nMM_INTERNAL_TOKEN=${crypto.randomBytes(32).toString('hex')}\nMIGRATION_DATABASE_URL=postgresql://mm_owner:${owner}@127.0.0.1:55432/manzanas_maracay_dev\nDATABASE_URL=postgresql://mm_app:${app}@127.0.0.1:55432/manzanas_maracay_dev\nMM_API_PORT=3101\nMM_WEB_PORT=3100\n`,
      { mode: 0o600 },
    );
  }
  dotenv.config({ path: envPath, quiet: true });
}
export function assertLocalDatabase(url) {
  const parsed = new URL(url);
  if (
    !['127.0.0.1', 'localhost'].includes(parsed.hostname) ||
    parsed.port !== '55432' ||
    !['/manzanas_maracay_dev', '/manzanas_maracay_test'].includes(parsed.pathname)
  )
    throw new Error('Este comando solo admite las bases locales exclusivas de Manzanas Maracay.');
}

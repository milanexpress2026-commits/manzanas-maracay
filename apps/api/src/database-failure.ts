// pg-pool connection/acquisition timeouts have no SQLSTATE. Match only these exact
// library messages; never log arbitrary Error.message, query text, params or URLs.
const connectionTimeouts = new Map([
  ['timeout exceeded when trying to connect', 'PG_POOL_ACQUIRE_TIMEOUT'],
  ['Connection terminated due to connection timeout', 'PG_CONNECTION_TIMEOUT'],
  ['timeout expired', 'PG_SOCKET_CONNECT_TIMEOUT'],
]);
export function databaseConnectionTimeout(error: unknown): string | null {
  const seen = new Set<object>();
  let current = error;
  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth++) {
    if (seen.has(current)) break;
    seen.add(current);
    const candidate = current as { message?: unknown; cause?: unknown };
    const category =
      typeof candidate.message === 'string' ? connectionTimeouts.get(candidate.message) : undefined;
    if (category) return category;
    current = candidate.cause;
  }
  return null;
}

const diagnosticCodes = new Set([
  '23505',
  '23503',
  '23514',
  '57014',
  '53300',
  '57P01',
  '08006',
  '08001',
  '08003',
  '08004',
  '40001',
  '40P01',
  '42P01',
  '42703',
  '42501',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
]);
export function databaseDiagnosticCode(code: unknown): string {
  return typeof code === 'string' && diagnosticCodes.has(code) ? code : 'unknown';
}

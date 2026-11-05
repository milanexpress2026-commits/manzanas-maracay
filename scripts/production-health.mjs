// Public liveness is intentionally distinct from approval to accept real operations.
const targets = {
  api: 'http://127.0.0.1:3101',
  web: 'http://127.0.0.1:3100',
  host: 'http://127.0.0.1:33101',
};
const target = targets[process.argv[2]];
const requireReady = process.argv.includes('--require-ready');
try {
  if (!target || process.argv.slice(3).some((value) => value !== '--require-ready'))
    throw new Error('arguments');
  if (
    process.env.MM_APP_ENV !== 'production' ||
    process.env.MM_APP_ORIGIN !== 'https://manzanas.ganamosclub.net'
  )
    throw new Error('environment');
  const commit = process.env.MM_COMMIT ?? '';
  const release = process.env.MM_RELEASE;
  if (!/^[a-f0-9]{40}$/.test(commit) || release !== `phase4-${commit.slice(0, 12)}`)
    throw new Error('release');
  const response = await fetch(`${target}/api/health`, {
    redirect: 'error',
    cache: 'no-store',
    signal: AbortSignal.timeout(6000),
  });
  const body = await response.json();
  if (
    !response.ok ||
    body.status !== 'ok' ||
    body.environment !== 'production' ||
    body.release !== release ||
    typeof body.ready !== 'boolean'
  )
    throw new Error('health');
  if (requireReady && !body.ready) throw new Error('not_ready');
  if (requireReady) console.log('Producción preparada y activación verificada por el servidor.');
} catch {
  console.error(
    requireReady
      ? 'Producción no habilitada: revisar salud y gates privados.'
      : 'Salud de producción no verificada.',
  );
  process.exitCode = 1;
}

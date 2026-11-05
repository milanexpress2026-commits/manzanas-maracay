import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const commit = 'a'.repeat(40);
const release = `phase4-${commit.slice(0, 12)}`;
const origin = 'https://manzanas.ganamosclub.net';

function child(program: string) {
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', program], {
    encoding: 'utf8',
    timeout: 10_000,
  });
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout.trim());
}

function runtime(mode: string, scenario = 'valid', extraArguments: string[] = []) {
  const url = pathToFileURL(resolve('scripts/production-runtime.mjs')).href;
  return child(`
    import fs from 'node:fs';
    import cp from 'node:child_process';
    import { syncBuiltinESMExports } from 'node:module';
    import { EventEmitter } from 'node:events';
    import { createECDH } from 'node:crypto';
    const mode=${JSON.stringify(mode)}, scenario=${JSON.stringify(scenario)};
    for (const name of Object.keys(process.env)) {
      if (name.startsWith('MM_') || ['DATABASE_URL','MIGRATION_DATABASE_URL'].includes(name)) delete process.env[name];
    }
    Object.assign(process.env, {
      MM_APP_ENV:'production', MM_APP_ORIGIN:${JSON.stringify(origin)},
      MM_COMMIT:${JSON.stringify(commit)}, MM_RELEASE:${JSON.stringify(release)},
      MM_INTERNAL_TOKEN_FILE:'/run/secrets/internal_token', MM_APP_PASSWORD_FILE:'/run/secrets/app_password',
      MM_PG_PASSWORD_FILE:'/run/secrets/owner_password', MM_PRIVATE_DIR:'/run/secrets',
      MM_API_BASE_URL:'http://api:3101', MM_API_HOST:'0.0.0.0', MM_API_PORT:'3101',
      MM_PRODUCTION_GATE_FILE:'/run/mm-production-state/activation.json'
    });
    const content = {
      '/run/secrets/internal_token':'synthetic-internal-token-only-for-tests',
      '/run/secrets/app_password':'synthetic-app-password-only-for-tests-00',
      '/run/secrets/owner_password':'synthetic-owner-password-only-for-tests0',
    };
    if (scenario === 'staging') process.env.MM_APP_ENV='staging';
    if (scenario === 'origin') process.env.MM_APP_ORIGIN='http://manzanas.ganamosclub.net';
    if (scenario === 'release') process.env.MM_RELEASE='phase4-bbbbbbbbbbbb';
    if (scenario === 'direct_database') process.env.DATABASE_URL='postgresql://synthetic@staging/wrong';
    if (scenario === 'direct_token') process.env.MM_INTERNAL_TOKEN='synthetic-direct-token';
    if (scenario === 'wrong_api') process.env.MM_API_BASE_URL='http://another-service:3101';
    if (scenario === 'wrong_secret_path') process.env.MM_INTERNAL_TOKEN_FILE='/run/secrets/../outside';
    if (scenario === 'wrong_gate_path') process.env.MM_PRODUCTION_GATE_FILE='/run/secrets/activation.json';
    if (scenario === 'short') content['/run/secrets/internal_token']='short';
    if (scenario.startsWith('vapid')) {
      process.env.MM_VAPID_PUBLIC_KEY_FILE='/run/secrets/vapid_public_key';
      if (scenario !== 'vapid_partial') {
        process.env.MM_VAPID_PRIVATE_KEY_FILE='/run/secrets/vapid_private_key';
        process.env.MM_VAPID_SUBJECT_FILE='/run/secrets/vapid_subject';
      }
      const pair=createECDH('prime256v1'), scalar=Buffer.alloc(32); scalar[31]=1; pair.setPrivateKey(scalar);
      content['/run/secrets/vapid_public_key']=pair.getPublicKey().toString('base64url');
      content['/run/secrets/vapid_private_key']=scalar.toString('base64url');
      content['/run/secrets/vapid_subject']=${JSON.stringify(origin)};
      if (scenario === 'vapid_mismatch') { scalar[31]=2; content['/run/secrets/vapid_private_key']=scalar.toString('base64url'); }
    }
    const realRead=fs.readFileSync, realStat=fs.lstatSync, realPath=fs.realpathSync, reads=[], calls=[];
    fs.readFileSync=(path,...args)=> {
      if (String(path).startsWith('/run/')) {
        reads.push(path);
        if (!(path in content)) throw new Error('Unexpected synthetic read');
        return content[path];
      }
      return realRead(path,...args);
    };
    fs.lstatSync=(path,...args)=> {
      if (!String(path).startsWith('/run/')) return realStat(path,...args);
      const directory=path==='/run/mm-production-state';
      return {
        isFile:()=>!directory, isDirectory:()=>directory, isSymbolicLink:()=>scenario==='symlink',
        mode:directory?(scenario==='writable_control'?0o777:0o750):(scenario==='readable_secret'?0o444:0o400),
        uid:directory?0:(scenario==='wrong_owner'?70:1000), gid:1000,
        size:scenario==='oversized'?4097:(content[path]?.length??0)
      };
    };
    fs.realpathSync=(path,...args)=>String(path).startsWith('/run/')?path:realPath(path,...args);
    cp.spawn=(_exe,args,options)=> {
      const raw=options.env.DATABASE_URL??options.env.MIGRATION_DATABASE_URL;
      const database=raw?new URL(raw):null;
      calls.push({args, role:database?.username??null, database:database?.pathname??null, internal:Boolean(options.env.MM_INTERNAL_TOKEN), vapid:Boolean(options.env.MM_VAPID_PRIVATE_KEY)});
      const process=new EventEmitter(); queueMicrotask(()=>process.emit('exit',0)); return process;
    };
    syncBuiltinESMExports(); process.argv[2]=mode; process.argv.push(...${JSON.stringify(extraArguments)});
    try { await import(${JSON.stringify(url)}); console.log(JSON.stringify({ok:true,reads,calls})); }
    catch(error) { console.log(JSON.stringify({ok:false,launched:calls.length,message:error.message})); }
  `);
}

describe('production runtime boundaries', () => {
  it('uses only the new app role/database and API secrets', () => {
    expect(runtime('api')).toMatchObject({
      ok: true,
      reads: ['/run/secrets/internal_token', '/run/secrets/app_password'],
      calls: [
        {
          role: 'mm_prod_app',
          database: '/manzanas_maracay_production',
          internal: true,
          vapid: false,
        },
      ],
    });
  });
  it('migrates as the limited owner without ever seeding a catalog or stock', () => {
    expect(runtime('migrate')).toMatchObject({
      ok: true,
      reads: ['/run/secrets/owner_password'],
      calls: [
        { args: ['--import', 'tsx', 'scripts/migrate.ts'], role: 'mm_prod_owner', internal: false },
      ],
    });
  });
  it('web receives only the internal token, no database or push keys', () => {
    expect(runtime('web')).toMatchObject({
      ok: true,
      reads: ['/run/secrets/internal_token'],
      calls: [{ role: null, internal: true, vapid: false }],
    });
  });
  it('supports explicit owner access rotation using the private invitation file', () => {
    expect(runtime('invite', 'valid', ['--reset'])).toMatchObject({
      ok: true,
      reads: ['/run/secrets/owner_password'],
      calls: [
        {
          args: [
            '--import',
            'tsx',
            'scripts/create-user.ts',
            '--file',
            '/run/secrets/invitation',
            '--reset',
          ],
          role: 'mm_prod_owner',
        },
      ],
    });
  });
  it.each([
    ['api', ['--reset']],
    ['migrate', ['--reset']],
    ['invite', ['--file', '/another/file']],
    ['invite', ['--reset', '--reset']],
    ['invite', ['--password=secret']],
  ])('rejects extra arguments for %s', (mode, args) => {
    expect(runtime(mode as string, 'valid', args as string[])).toMatchObject({
      ok: false,
      launched: 0,
    });
  });
  it.each(['seed', 'preview', 'reset'])('does not provide a %s command', (mode) => {
    expect(runtime(mode)).toMatchObject({ ok: false, launched: 0 });
  });
  it.each([
    'staging',
    'origin',
    'release',
    'direct_database',
    'direct_token',
    'wrong_secret_path',
    'wrong_gate_path',
    'short',
    'symlink',
    'readable_secret',
    'wrong_owner',
    'oversized',
    'writable_control',
  ])('fails closed for %s', (scenario) => {
    expect(runtime('api', scenario)).toMatchObject({ ok: false, launched: 0 });
  });
  it('rejects a web destination outside its own API', () => {
    expect(runtime('web', 'wrong_api')).toMatchObject({ ok: false, launched: 0 });
  });
  it('accepts a complete matching API-only VAPID pair', () => {
    expect(runtime('api', 'vapid_valid')).toMatchObject({ ok: true, calls: [{ vapid: true }] });
  });
  it.each(['vapid_partial', 'vapid_mismatch'])('rejects %s', (scenario) => {
    expect(runtime('api', scenario)).toMatchObject({ ok: false, launched: 0 });
  });
  it.each(['web', 'migrate'])('rejects VAPID mounted in %s', (mode) => {
    expect(runtime(mode, 'vapid_valid')).toMatchObject({ ok: false, launched: 0 });
  });
});

function health(ready: boolean, requireReady: boolean, mismatch?: string) {
  const url = pathToFileURL(resolve('scripts/production-health.mjs')).href;
  return child(`
    Object.assign(process.env,{MM_APP_ENV:'production',MM_APP_ORIGIN:${JSON.stringify(origin)},MM_COMMIT:${JSON.stringify(commit)},MM_RELEASE:${JSON.stringify(release)}});
    process.argv[2]='api'; if (${requireReady}) process.argv.push('--require-ready');
    let request;
    globalThis.fetch=async(url,options)=>{request={url,redirect:options.redirect};return {ok:true,json:async()=>({status:'ok',environment:${JSON.stringify(mismatch === 'environment' ? 'staging' : 'production')},release:${JSON.stringify(mismatch === 'release' ? 'different' : release)},ready:${ready}})}};
    console.log=()=>{}; console.error=()=>{};
    await import(${JSON.stringify(url)});
    const result={code:process.exitCode??0,request}; process.exitCode=0;
    process.stdout.write(JSON.stringify(result));
  `);
}

describe('production liveness and readiness are different checks', () => {
  it('allows healthy prepared processes while business activation is closed', () => {
    expect(health(false, false)).toMatchObject({
      code: 0,
      request: { url: 'http://127.0.0.1:3101/api/health', redirect: 'error' },
    });
    expect(health(false, true)).toMatchObject({ code: 1 });
  });
  it('requires actual server readiness for activation', () => {
    expect(health(true, true)).toMatchObject({ code: 0 });
  });
  it.each(['environment', 'release'])('rejects healthy status with wrong %s', (mismatch) => {
    expect(health(true, true, mismatch)).toMatchObject({ code: 1 });
  });
});

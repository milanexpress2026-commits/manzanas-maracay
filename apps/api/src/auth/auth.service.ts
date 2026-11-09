import { Injectable, UnauthorizedException, HttpException, OnModuleDestroy } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import {
  loginSchema,
  type SessionInfo,
  type SessionUser,
} from '../../../../packages/domain/src/auth';
import { authConfig } from './config';
import { operationsReady } from '../production-state';
import { DUMMY_PASSWORD_HASH, verifyPassword } from './password';

const tokenHash = (value: string) => createHash('sha256').update(value).digest('hex');

@Injectable()
export class AuthService implements OnModuleDestroy {
  private hashing = false;
  readonly pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 10000,
    statement_timeout: 5000,
  });
  constructor() {
    this.pool.on('error', () => console.warn('Conexión de autenticación interrumpida.'));
  }
  async onModuleDestroy() {
    await this.pool.end();
  }

  private async hitBucket(bucket: string, seconds: number, limit: number) {
    const { rows } = await this.pool.query<{ attempts: number }>(
      `
      INSERT INTO auth_login_buckets(bucket_key,attempts,window_started_at,updated_at)
      VALUES($1,1,clock_timestamp(),clock_timestamp())
      ON CONFLICT(bucket_key) DO UPDATE SET
        attempts=CASE WHEN auth_login_buckets.window_started_at<=clock_timestamp()-make_interval(secs=>$2) THEN 1 ELSE LEAST(auth_login_buckets.attempts+1,1000000) END,
        window_started_at=CASE WHEN auth_login_buckets.window_started_at<=clock_timestamp()-make_interval(secs=>$2) THEN clock_timestamp() ELSE auth_login_buckets.window_started_at END,
        updated_at=clock_timestamp()
      RETURNING attempts`,
      [bucket, seconds],
    );
    if (rows[0].attempts > limit)
      throw new HttpException(
        'Demasiados intentos. Espera unos minutos antes de volver a entrar.',
        429,
      );
  }

  async login(body: unknown, previousToken?: string) {
    const input = loginSchema.parse(body);
    // A persistent global budget also bounds attempts with an unlimited stream of usernames.
    await this.hitBucket('global', 60, 120);
    const userBucket = `user:${tokenHash(input.username)}`;
    await this.hitBucket(userBucket, 15 * 60, 8);
    if (this.hashing)
      throw new HttpException('Hay otro acceso en curso. Vuelve a intentar en unos segundos.', 429);
    this.hashing = true;
    let user:
      | {
          id: string;
          username: string;
          display_name: string;
          password_hash: string;
          active: boolean;
        }
      | undefined;
    try {
      user = (
        await this.pool.query(
          'SELECT id,username,display_name,password_hash,active FROM app_users WHERE username=$1',
          [input.username],
        )
      ).rows[0];
      const valid = await verifyPassword(
        input.password,
        user?.password_hash ?? DUMMY_PASSWORD_HASH,
      );
      if (!valid || !user?.active)
        throw new UnauthorizedException('Usuario o contraseña incorrectos.');
    } finally {
      this.hashing = false;
    }
    if (!user) throw new UnauthorizedException('Usuario o contraseña incorrectos.');

    const token = randomBytes(32).toString('hex');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Use the same transaction lock as provisionUser. A password reset must
      // finish first (invalidating this hash) or revoke this committed session afterward.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        `user:${user.username}`,
      ]);
      const current = await client.query(
        'SELECT id FROM app_users WHERE id=$1 AND password_hash=$2 AND active',
        [user.id, user.password_hash],
      );
      if (!current.rowCount) throw new UnauthorizedException('Usuario o contraseña incorrectos.');
      await client.query(
        "INSERT INTO auth_sessions(token_hash,user_id,expires_at,remember_session) VALUES($1,$2,now()+CASE WHEN $3::boolean THEN interval '30 days' ELSE interval '8 hours' END,$3)",
        [tokenHash(token), user.id, input.rememberSession],
      );
      if (previousToken)
        await client.query(
          'UPDATE auth_sessions SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL',
          [tokenHash(previousToken)],
        );
      await client.query('DELETE FROM auth_login_buckets WHERE bucket_key=$1', [userBucket]);
      await client.query(
        "DELETE FROM auth_login_buckets WHERE updated_at < now()-interval '1 day'",
      );
      await client.query("DELETE FROM auth_sessions WHERE expires_at < now()-interval '1 day'");
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return {
      token,
      rememberSession: input.rememberSession,
      info: await this.info({
        id: user.id,
        username: user.username,
        displayName: user.display_name,
      }),
    };
  }

  async authenticate(token: string | undefined): Promise<SessionUser> {
    if (!token) throw new UnauthorizedException('Inicia sesión para acceder.');
    const { rows } = await this.pool.query(
      `UPDATE auth_sessions AS s SET last_seen_at=now()
      FROM app_users AS u WHERE s.token_hash=$1 AND s.user_id=u.id AND u.active
      AND s.revoked_at IS NULL AND s.expires_at>now()
      AND (s.remember_session OR s.last_seen_at>now()-interval '30 minutes')
      AND s.created_at>=u.password_changed_at
      RETURNING u.id,u.username,u.display_name`,
      [tokenHash(token)],
    );
    if (!rows[0]) throw new UnauthorizedException('Tu sesión terminó. Vuelve a iniciar sesión.');
    return { id: rows[0].id, username: rows[0].username, displayName: rows[0].display_name };
  }
  async info(user: SessionUser): Promise<SessionInfo> {
    const { rows } = await this.pool.query<{ id: string }>(
      "select key as id from command_receipts where response->>'kind'='owner_authorized_operation_reset' order by created_at desc,key desc limit 1",
    );
    const digest = rows[0]
      ? createHash('sha256')
          .update(user.id + ':' + rows[0].id)
          .digest('hex')
      : null;
    const operationScopeId = digest
      ? `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`
      : user.id;
    return {
      user,
      environment: authConfig().environment,
      operationsReady: operationsReady(),
      operationScopeId,
    };
  }
  async logout(token: string | undefined) {
    if (token)
      await this.pool.query(
        'UPDATE auth_sessions SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL',
        [tokenHash(token)],
      );
  }
}

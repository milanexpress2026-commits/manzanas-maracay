import type { Pool } from 'pg';
import { invitationSchema } from '../../../../packages/domain/src/auth';
import { hashPassword } from './password';

/** Administrative connection only. No public endpoint creates or resets users. */
export async function provisionUser(
  pool: Pool,
  input: unknown,
  options: { replaceExisting?: boolean } = {},
) {
  const user = invitationSchema.parse(input);
  const hash = await hashPassword(user.password);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
      `user:${user.username}`,
    ]);
    const existing = (
      await client.query('SELECT id FROM app_users WHERE username=$1 FOR UPDATE', [user.username])
    ).rows[0];
    if (existing && !options.replaceExisting)
      throw new Error(
        'El usuario ya existe. Usa la opción explícita de restablecimiento si corresponde.',
      );
    const { rows } = existing
      ? await client.query(
          'UPDATE app_users SET display_name=$2,password_hash=$3,password_changed_at=now(),active=true WHERE id=$1 RETURNING id,username,display_name',
          [existing.id, user.displayName, hash],
        )
      : await client.query(
          'INSERT INTO app_users(username,display_name,password_hash) VALUES($1,$2,$3) RETURNING id,username,display_name',
          [user.username, user.displayName, hash],
        );
    if (existing)
      await client.query(
        'UPDATE auth_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL',
        [existing.id],
      );
    await client.query('COMMIT');
    return {
      id: rows[0].id as string,
      username: rows[0].username as string,
      displayName: rows[0].display_name as string,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

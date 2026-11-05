'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { ArrowRight, LoaderCircle, LockKeyhole } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import styles from './login.module.css';
import type { AppEnvironment } from '@mm/domain';

export function LoginForm({ environment }: { environment: AppEnvironment }) {
  const production = environment === 'production';
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: form.get('username'),
          password: form.get('password'),
          rememberSession: form.get('rememberSession') === 'on',
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? 'No se pudo iniciar sesión.');
      window.location.assign(production ? '/inicio' : '/catalogo');
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'No se pudo conectar. Vuelve a intentar.',
      );
      setBusy(false);
    }
  }
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <section className={styles.brand} aria-label="Manzanas Maracay">
          <Image
            src="/brand/logo-manzanas-maracay.webp"
            width={240}
            height={240}
            sizes="(max-width: 640px) 132px, 240px"
            alt="Manzanas Maracay · Frutas importadas"
            loading="eager"
          />
          <p>
            Tu mercancía, en orden.
            <br />
            Desde la recepción hasta el último abono.
          </p>
        </section>
        <section className={styles.formSection} aria-labelledby="login-title">
          {['staging', 'test'].includes(environment) && (
            <p className={styles.notice}>ENTORNO DE PRUEBAS</p>
          )}
          <LockKeyhole className={styles.lock} aria-hidden="true" />
          <h1 id="login-title">Bienvenido a Manzanas Maracay</h1>
          <p className={styles.intro}>
            {production
              ? 'Acceso privado de los propietarios. Usa el mismo acceso en tu teléfono, tablet o computadora.'
              : 'Entra con el usuario que te compartió el propietario.'}
          </p>
          <form onSubmit={submit} className={styles.form}>
            <div>
              <Label htmlFor="username">Usuario</Label>
              <Input
                id="username"
                name="username"
                required
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={80}
                disabled={busy}
              />
            </div>
            <div>
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                maxLength={256}
                disabled={busy}
              />
            </div>
            <div className={styles.remember}>
              <label htmlFor="rememberSession">
                <input
                  id="rememberSession"
                  name="rememberSession"
                  type="checkbox"
                  aria-describedby="rememberSession-help"
                  disabled={busy}
                />
                <span>Mantener sesión activa</span>
              </label>
              <p id="rememberSession-help">
                Conserva el acceso durante 30 días en este dispositivo. Puedes cerrar sesión cuando
                quieras.
              </p>
            </div>
            {error && (
              <p role="alert" className={styles.error}>
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy} className={styles.submit}>
              {busy ? (
                <LoaderCircle className="spin" aria-hidden="true" />
              ) : (
                <ArrowRight aria-hidden="true" />
              )}
              {busy ? 'Verificando acceso…' : 'Entrar'}
            </Button>
          </form>
          <p className={styles.help}>
            Si necesitas acceso o recuperar tu contraseña, comunícate con el propietario.
          </p>
          {!production ? <Link href="/demo">Explorar demostración sin contraseña</Link> : null}
        </section>
      </div>
    </main>
  );
}

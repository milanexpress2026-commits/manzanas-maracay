'use client';
import { useState, useEffect } from 'react';
import { Bell, BellOff, Tablet } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Field, FieldLabel } from './ui/field';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { FormError } from './operations-ui';
import { ApiError, useRemote, useCommand } from '@/lib/inventory-api';
type PushStatus = {
  configured: boolean;
  subscribed: boolean;
  publicKey: string | null;
  deviceLabel: string | null;
  endpointHash: string | null;
};
type SubscribeBody = {
  subscription: {
    endpoint: string;
    expirationTime: number | null;
    keys: { p256dh: string; auth: string };
  };
  deviceLabel: string;
  replaceExisting: boolean;
};
async function digest(value: string) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))),
  )
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
function publicKeyBytes(key: string) {
  const binary = atob(
    key.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (key.length % 4)) % 4),
  );
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}
export function CollectionPush() {
  const status = useRemote<PushStatus>('/api/push/status'),
    command = useCommand();
  const [supported, setSupported] = useState(false),
    [localHash, setLocalHash] = useState<string | null>(null),
    [label, setLabel] = useState('Tablet de cobranza'),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  const [pending, setPending] = useState<{
    body: SubscribeBody;
    subscription: PushSubscription;
    created: boolean;
  } | null>(null);
  useEffect(() => {
    const ok =
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window &&
      window.isSecureContext;
    setSupported(ok);
    if (ok)
      void navigator.serviceWorker.ready
        .then((r) => r.pushManager.getSubscription())
        .then((s) => (s ? digest(s.endpoint) : null))
        .then(setLocalHash)
        .catch(() => {});
  }, [status.data?.endpointHash]);
  const own = !!localHash && localHash === status.data?.endpointHash;
  async function subscribe() {
    if (!status.data?.configured || !status.data.publicKey || !supported) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setMessage('No se activaron notificaciones. El centro de cobranza sigue disponible.');
        return;
      }
      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      let sub = await registration.pushManager.getSubscription();
      const created = !sub;
      if (!sub)
        sub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: publicKeyBytes(status.data.publicKey),
        });
      const json = sub.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth)
        throw new Error('El navegador no devolvió una suscripción válida.');
      const body: SubscribeBody = {
        subscription: {
          endpoint: json.endpoint,
          expirationTime: json.expirationTime ?? null,
          keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        },
        deviceLabel: label.trim() || 'Tablet de cobranza',
        replaceExisting: false,
      };
      try {
        await command.run('/api/push/subscribe', body);
        setLocalHash(await digest(sub.endpoint));
        await status.reload();
        setMessage(
          'Esta tablet quedó suscrita. La entrega real debe comprobarse en el dispositivo.',
        );
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          command.setError('');
          setPending({ body, subscription: sub, created });
        } else {
          if (created) await sub.unsubscribe();
          throw e;
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo activar la suscripción.');
    } finally {
      setBusy(false);
    }
  }
  async function replace() {
    if (!pending) return;
    setBusy(true);
    setError('');
    try {
      await command.run('/api/push/subscribe', { ...pending.body, replaceExisting: true });
      setLocalHash(await digest(pending.subscription.endpoint));
      setPending(null);
      await status.reload();
      setMessage('Esta tablet reemplazó a la suscripción anterior.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo reemplazar.');
    } finally {
      setBusy(false);
    }
  }
  async function cancelPending() {
    if (pending?.created) await pending.subscription.unsubscribe();
    setPending(null);
    setError('');
    command.setError('');
  }
  async function unsubscribe() {
    setBusy(true);
    setError('');
    try {
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      if (!sub) throw new Error('Esta tablet no tiene una suscripción local.');
      await command.run('/api/push/unsubscribe', { endpoint: sub.endpoint });
      await sub.unsubscribe();
      setLocalHash(null);
      await status.reload();
      setMessage('Notificaciones desactivadas en esta tablet.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo desactivar.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="operations-panel commercial-form-panel"
      aria-label="Notificaciones de la tablet"
    >
      <h2 className="commercial-section-title">
        <Tablet aria-hidden="true" />
        Tablet principal de cobranza
      </h2>
      <p className="commercial-help">
        Solo un dispositivo puede recibir los avisos. Los socios pueden consultar este centro sin
        suscribirse.
      </p>
      {status.data?.configured ? (
        <>
          <p>
            {own
              ? 'Esta tablet está suscrita.'
              : status.data.subscribed
                ? 'Dispositivo suscrito: ' + status.data.deviceLabel
                : 'No hay una tablet suscrita.'}
          </p>
          {!own ? (
            <Field>
              <FieldLabel htmlFor="push-label">Nombre del dispositivo</FieldLabel>
              <Input
                id="push-label"
                value={label}
                maxLength={80}
                onChange={(e) => setLabel(e.target.value)}
              />
            </Field>
          ) : null}
          <div className="inline-actions">
            {own ? (
              <Button variant="outline" disabled={busy} onClick={() => void unsubscribe()}>
                <BellOff aria-hidden="true" />
                Desactivar en esta tablet
              </Button>
            ) : (
              <Button
                variant="outline"
                disabled={busy || !supported}
                onClick={() => void subscribe()}
              >
                <Bell aria-hidden="true" />
                {busy ? 'Activando…' : 'Activar en esta tablet'}
              </Button>
            )}
          </div>
          {!supported ? (
            <p className="commercial-help">
              Este navegador no ofrece notificaciones web. En iOS puede requerir instalar la
              aplicación en la pantalla de inicio. Consulta aquí los recordatorios.
            </p>
          ) : null}
        </>
      ) : (
        <p className="commercial-help">
          Notificaciones push aún no habilitadas en este entorno. Los recordatorios siguen
          disponibles aquí.
        </p>
      )}
      {status.error ? (
        <p className="commercial-help">
          No se pudo consultar la suscripción. Recarga para reintentar.
        </p>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
      <FormError message={!pending ? error : ''} />
      <Dialog
        open={!!pending}
        onOpenChange={(open) => {
          if (!open && !busy) void cancelPending();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reemplazar tablet de cobranza</DialogTitle>
            <DialogDescription>
              La tablet anterior dejará de recibir avisos. Solo este dispositivo quedará suscrito.
            </DialogDescription>
          </DialogHeader>
          <p>Dispositivo anterior: {status.data?.deviceLabel ?? 'Tablet registrada'}</p>
          <FormError message={error} />
          <div className="form-actions">
            <Button variant="outline" disabled={busy} onClick={() => void cancelPending()}>
              Cancelar
            </Button>
            <Button disabled={busy} onClick={() => void replace()}>
              Reemplazar y activar aquí
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

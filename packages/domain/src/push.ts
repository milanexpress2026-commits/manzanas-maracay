import { z } from 'zod';

export function allowedPushEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.port ||
      url.username ||
      url.password ||
      url.hash ||
      url.search
    )
      return false;
    return (
      (url.hostname === 'fcm.googleapis.com' && /^\/(fcm\/send|wp)\/[^/]+$/.test(url.pathname)) ||
      (url.hostname === 'updates.push.services.mozilla.com' &&
        /^\/wpush\/v2\/[^/]+$/.test(url.pathname)) ||
      (url.hostname === 'web.push.apple.com' && /^\/[^/]+$/.test(url.pathname))
    );
  } catch {
    return false;
  }
}

const endpoint = z
  .string()
  .max(2048)
  .refine(
    allowedPushEndpoint,
    'El servicio push de este navegador no está admitido. Usa Chrome, Firefox o Safari compatible.',
  );
export const pushSubscribeSchema = z
  .object({
    subscription: z
      .object({
        endpoint,
        expirationTime: z.number().finite().positive().nullable().optional(),
        keys: z
          .object({
            p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}$/, 'La clave pública push no es válida.'),
            auth: z.string().regex(/^[A-Za-z0-9_-]{22}$/, 'La clave de cifrado push no es válida.'),
          })
          .strict(),
      })
      .strict(),
    deviceLabel: z.string().trim().min(2).max(80),
    replaceExisting: z.boolean().default(false),
  })
  .strict();
export const pushUnsubscribeSchema = z.object({ endpoint }).strict();
export type PushSubscribeInput = z.infer<typeof pushSubscribeSchema>;

export function caracasBusinessDate(at: Date): string {
  if (!Number.isFinite(at.getTime())) throw new Error('Fecha inválida.');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Caracas',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const part = (name: string) => parts.find((p) => p.type === name)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function collectionPushPayload() {
  // Deliberately no client, invoice number, amount, phone or document URL on the lock screen.
  return {
    title: 'Manzanas Maracay',
    body: 'Tienes recordatorios de cobranza para revisar en la aplicación.',
    tag: 'manzanas-cobranza',
    url: '/cobranza',
  } as const;
}

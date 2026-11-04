import { collectionPushPayload } from '../../../packages/domain/src/push';

export type PushBatch = {
  id: string;
  generation: string;
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
};
export type PushOutcome = 'accepted' | 'failed' | 'uncertain';
export interface PushDispatchStore {
  claim(at: Date): Promise<PushBatch | null>;
  revalidate(batch: PushBatch, at: Date): Promise<boolean>;
  finish(batch: PushBatch, outcome: PushOutcome, code: string): Promise<void>;
}
export type PushSender = (
  subscription: PushBatch['subscription'],
  payload: string,
) => Promise<{ statusCode: number }>;

/** One attempt per invoice/reminder date. Ambiguous delivery is not retried automatically. */
export async function dispatchCollectionPush(
  store: PushDispatchStore,
  send: PushSender,
  now: () => Date = () => new Date(),
): Promise<'idle' | 'cancelled' | PushOutcome> {
  const batch = await store.claim(now());
  if (!batch) return 'idle';
  if (!(await store.revalidate(batch, now()))) return 'cancelled';
  let outcome: PushOutcome;
  let code: string;
  try {
    const response = await send(batch.subscription, JSON.stringify(collectionPushPayload()));
    outcome = response.statusCode >= 200 && response.statusCode < 300 ? 'accepted' : 'failed';
    code = String(response.statusCode);
  } catch (error) {
    const status = (error as { statusCode?: unknown }).statusCode;
    const knownStatus =
      typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599;
    outcome = knownStatus ? 'failed' : 'uncertain';
    code = knownStatus ? String(status) : 'transport_uncertain';
  }
  await store.finish(batch, outcome, code);
  return outcome;
}

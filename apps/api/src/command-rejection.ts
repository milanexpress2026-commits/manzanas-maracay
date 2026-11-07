import { HttpException } from '@nestjs/common';

const rejected = new WeakMap<object, string>();
export type CommandAttemptPhase = {
  kind: string;
  callbackStarted: boolean;
  commitStarted: boolean;
  rollbackConfirmed: boolean;
};

/** Response metadata only. No rejected command is persisted or replayed. */
export function markBusinessCommandRejection(
  error: unknown,
  key: string,
  phase: CommandAttemptPhase,
) {
  if (error && typeof error === 'object') rejected.delete(error);
  const code = error && typeof error === 'object' ? (error as { code?: string }).code : undefined;
  const businessError =
    error instanceof HttpException
      ? [400, 404, 409, 422].includes(error.getStatus())
      : ['23503', '23514', '23505'].includes(code ?? '');
  if (
    ['sale', 'payment'].includes(phase.kind) &&
    phase.callbackStarted &&
    !phase.commitStarted &&
    phase.rollbackConfirmed &&
    businessError &&
    error &&
    typeof error === 'object'
  )
    rejected.set(error, key);
}
export function businessCommandRejection(error: unknown) {
  if (!error || typeof error !== 'object') return {};
  const commandKey = rejected.get(error);
  return commandKey ? { commandOutcome: 'rejected' as const, commandKey } : {};
}

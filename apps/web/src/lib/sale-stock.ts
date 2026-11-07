import type { SalePreviewInput, SalePreviewResult } from '@mm/domain';
import type { SaleDraftLine } from './sales-flow';

/** Context for a warning only; a changed own quantity never makes an old result current. */
export function saleStockWarningContext(lines: SaleDraftLine[], key: number, date: string) {
  return JSON.stringify([
    date,
    lines.map((line) => [
      line.key,
      line.configurationId,
      line.presentation,
      line.key === key ? null : line.quantity,
    ]),
  ]);
}

/** Text remains editable; only this grammar can become a physical quantity. */
export function saleQuantity(value: string): number | null {
  if (!/^\d{1,4}$/.test(value)) return null;
  const quantity = Number(value);
  return quantity >= 1 && quantity <= 1000 ? quantity : null;
}

export function saleQuantityIssue(value: string): string {
  return saleQuantity(value) === null
    ? 'Escribe una cantidad entera de 1 a 1.000, sin decimales ni exponentes.'
    : '';
}

/** A superseded response is never evidence for the new cart, even if abort is ignored. */
export class SalePreviewRequest {
  private sequence = 0;
  private controller: AbortController | null = null;
  cancel() {
    this.sequence += 1;
    this.controller?.abort();
    this.controller = null;
  }
  async read(
    input: SalePreviewInput,
    send: typeof fetch = fetch,
  ): Promise<SalePreviewResult | null> {
    this.cancel();
    const sequence = this.sequence;
    const controller = new AbortController();
    this.controller = controller;
    try {
      const response = await send('/api/inventory/sale-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify(input),
        signal: controller.signal,
      });
      const raw: unknown = await response.json().catch(() => null);
      const body =
        raw && typeof raw === 'object'
          ? (raw as Partial<SalePreviewResult> & { message?: unknown })
          : null;
      if (sequence !== this.sequence) return null;
      if (!response.ok)
        throw new Error(
          response.status === 401
            ? 'Tu sesión terminó. Inicia sesión de nuevo para comprobar las existencias.'
            : typeof body?.message === 'string'
              ? body.message
              : 'No se pudieron comprobar las existencias. Conservamos la venta; vuelve a consultar.',
        );
      const outputLines = body?.lines ?? [];
      if (
        !body ||
        body.reservesStock !== false ||
        typeof body.valid !== 'boolean' ||
        !Array.isArray(body.lines) ||
        !Array.isArray(body.issues) ||
        typeof body.checkedAt !== 'string' ||
        !Number.isFinite(Date.parse(body.checkedAt)) ||
        body.lines.length !== input.lines.length ||
        input.lines.some(
          (line) =>
            outputLines.filter(
              (item: SalePreviewResult['lines'][number]) =>
                !!item &&
                typeof item === 'object' &&
                item.lineKey === line.lineKey &&
                (item.maxQuantity === null ||
                  (Number.isInteger(item.maxQuantity) &&
                    item.maxQuantity >= 0 &&
                    item.maxQuantity <= 1000)),
            ).length !== 1,
        )
      )
        throw new Error(
          'La comprobación de existencias no es válida. Actualiza antes de continuar.',
        );
      return body as SalePreviewResult;
    } catch (error) {
      if (sequence !== this.sequence || controller.signal.aborted) return null;
      throw error;
    }
  }
}

import Decimal from 'decimal.js';

/** Plan a partial return against the current document, without changing payments.
 * Amounts follow the remaining quantity, so repeated returns reconcile cents.
 * Quantities count the selected presentation: one half-box remains one half-box.
 */
export function planSaleReduction(
  lines: { id: string; quantity: number; agreedUnitUsd: string; totalUsd: string }[],
  removed: { lineId: string; quantity: number }[],
  paidUsd: string,
) {
  if (
    !lines.length ||
    !removed.length ||
    new Set(lines.map((line) => line.id)).size !== lines.length ||
    new Set(removed.map((line) => line.lineId)).size !== removed.length
  )
    throw new Error('Selecciona cada producto una sola vez.');
  const paid = new Decimal(paidUsd);
  if (!paid.isFinite() || paid.isNegative() || paid.decimalPlaces() > 2)
    throw new Error('No se pudo comprobar el importe abonado.');
  let originalTotal = new Decimal(0),
    remainingTotal = new Decimal(0);
  const changes = lines.map((line) => {
    const price = new Decimal(line.agreedUnitUsd),
      total = new Decimal(line.totalUsd);
    if (
      !Number.isSafeInteger(line.quantity) ||
      line.quantity <= 0 ||
      !price.isFinite() ||
      price.lte(0) ||
      !total.isFinite() ||
      !price.mul(line.quantity).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).eq(total)
    )
      throw new Error(
        'Las cantidades y el total de la venta no coinciden. Actualiza el comprobante.',
      );
    const quantity = removed.find((item) => item.lineId === line.id)?.quantity ?? 0;
    if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > line.quantity)
      throw new Error('No puedes quitar más mercancía de la que contiene la venta.');
    const remainingQuantity = line.quantity - quantity;
    const remaining = price.mul(remainingQuantity).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    originalTotal = originalTotal.add(total);
    remainingTotal = remainingTotal.add(remaining);
    return {
      lineId: line.id,
      quantity,
      remainingQuantity,
      remainingTotalUsd: remaining.toFixed(2),
      reductionUsd: total.sub(remaining).toFixed(2),
    };
  });
  if (removed.some((item) => !lines.some((line) => line.id === item.lineId) || item.quantity <= 0))
    throw new Error('Elige una cantidad mayor que cero de un producto de esta venta.');
  if (paid.gt(originalTotal))
    throw new Error('Los abonos actuales superan el total de la venta. Actualiza el comprobante.');
  return {
    changes: changes.filter((line) => line.quantity > 0),
    totalUsd: remainingTotal.toFixed(2),
    reductionUsd: originalTotal.sub(remainingTotal).toFixed(2),
    excessPaidUsd: Decimal.max(paid.sub(remainingTotal), 0).toFixed(2),
    balanceUsd: Decimal.max(remainingTotal.sub(paid), 0).toFixed(2),
    removesWholeSale: changes.every((line) => line.remainingQuantity === 0),
  };
}

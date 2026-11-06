import Decimal from 'decimal.js';
import type { Configuration } from '@mm/domain';

export const presentationNames = { box: 'Caja', half_box: 'Media caja', blister: 'Blíster' };
export function productLabel(
  product: Pick<Configuration, 'fruit' | 'variety' | 'caliber' | 'commercialLine'>,
) {
  return [
    product.fruit,
    product.variety,
    product.commercialLine,
    product.caliber ? `Cal. ${product.caliber}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}
export function packingLabel(
  product: Pick<
    Configuration,
    'packingModel' | 'blistersPerBox' | 'boxWeightKg' | 'commercialUnitLabel'
  >,
) {
  if (product.commercialUnitLabel) return product.commercialUnitLabel;
  if (product.packingModel === 'blister')
    return product.blistersPerBox == null
      ? 'Blíster por confirmar'
      : `${product.blistersPerBox} blíster / caja`;
  if (product.boxWeightKg) return `Caja de ${new Decimal(product.boxWeightKg).toString()} kg`;
  return product.packingModel === 'halves' ? 'Caja y media caja' : 'Caja completa';
}
export function normalizedMoney(value: string) {
  return value.trim().replace(',', '.');
}
export function decimalTotal(lines: { quantity: string | number; price: string }[]) {
  return lines
    .reduce((sum, line) => {
      const price = normalizedMoney(line.price);
      if (!/^\d+(\.\d{1,4})?$/.test(price) || !/^\d+$/.test(String(line.quantity))) return sum;
      return sum.plus(new Decimal(price).times(String(line.quantity)));
    }, new Decimal(0))
    .toFixed(2, Decimal.ROUND_HALF_UP);
}
export function caracasDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Caracas',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}
export function caracasDateTime(date = new Date()) {
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Caracas',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
  return `${caracasDate(date)}T${time}`;
}
export function caracasInstant(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new Error('Indica una fecha y hora válidas de Venezuela.');
  const date = new Date(`${value}:00-04:00`);
  if (Number.isNaN(date.valueOf()) || caracasDateTime(date) !== value)
    throw new Error('Indica una fecha y hora válidas de Venezuela.');
  return date.toISOString();
}
export function addCaracasDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00-04:00`);
  date.setUTCDate(date.getUTCDate() + days);
  return caracasDate(date);
}

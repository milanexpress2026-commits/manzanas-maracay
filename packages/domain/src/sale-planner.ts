import { z } from 'zod';
import { presentationSchema, type Presentation } from './commerce';
import type { ContainerStock } from './inventory';
import { allocateCost } from './costing';
import {
  effectiveSalePresentations,
  presentationCanUseLot,
  type SaleLotSnapshot,
} from './sale-availability';
import { containerPortions, portionsPerBox, takeCommercialPortions } from './commercial-portions';

export const salePreviewSchema = z
  .object({
    soldAt: z.iso.datetime({ offset: true }),
    dateMode: z.enum(['automatic', 'manual']).optional(),
    lines: z
      .array(
        z
          .object({
            lineKey: z.uuid(),
            configurationId: z.uuid(),
            presentation: presentationSchema,
            quantity: z.number().int().min(1).max(1000),
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict()
  .refine(
    (value) => new Set(value.lines.map((line) => line.lineKey)).size === value.lines.length,
    'Cada línea debe tener una identidad distinta.',
  );
export type SalePreviewInput = z.infer<typeof salePreviewSchema>;
export type SalePreviewIssueCode =
  | 'configuration_missing'
  | 'packing_pending'
  | 'presentation_not_allowed'
  | 'stock_insufficient'
  | 'receipt_after_sale'
  | 'cart_conflict'
  | 'sale_limit_exceeded'
  | 'future_sale_date';
export type SalePreviewIssue = {
  lineKey: string | null;
  issueCode: SalePreviewIssueCode;
  message: string;
};
export type SalePreviewResult = {
  checkedAt: string;
  reservesStock: false;
  valid: boolean;
  lines: {
    lineKey: string;
    maxQuantity: number | null;
    issueCode: SalePreviewIssueCode | null;
    message: string | null;
  }[];
  issues: SalePreviewIssue[];
};
export type SalePlannerRule = {
  packingModel?: SaleLotSnapshot['packingModel'];
  blistersPerBox?: number | null;
  id: string;
  variantId: string;
  commercialUnitLabel: string | null;
  confirmed: boolean;
  allowedPresentations: Presentation[];
};
export type SalePlannerLot = SaleLotSnapshot & {
  id: string;
  variantId: string;
  commercialUnitLabel: string | null;
  receivedAt: string;
  createdAt: string;
  /** Exact FIFO ordinal from the database query, including sub-millisecond timestamps. */
  fifoOrder: number;
  /** Exact SQL comparison for this snapshot's soldAt; Date would truncate microseconds. */
  receivedBeforeSale?: boolean;
  confirmed: boolean;
  containers: ContainerStock[];
};
export type SalePlannerStock = {
  rules: SalePlannerRule[];
  lots: SalePlannerLot[];
  requireConfirmedLots: boolean;
};
export type PlannedSaleAllocation = {
  lineKey: string;
  lotId: string;
  containerId: string;
  quantity: number;
  costUsd: string | null;
};
export type PhysicalSalePlan = {
  valid: boolean;
  issues: SalePreviewIssue[];
  allocations: PlannedSaleAllocation[];
  states: Map<string, Map<string, ContainerStock>>;
};
const groupKey = (value: { variantId: string; commercialUnitLabel: string | null }) =>
  JSON.stringify([value.variantId, value.commercialUnitLabel]);
const unitFor = (presentation: Presentation): ContainerStock['unit'] =>
  presentation === 'box'
    ? 'sealed_box'
    : presentation === 'blister'
      ? 'intact_blister'
      : 'prepared_half_box';
const rank: Record<Presentation, number> = { box: 0, blister: 1, half_box: 2 };
function effectiveRules(stock: SalePlannerStock) {
  return new Map(
    stock.rules.map((rule) => {
      const lot = stock.lots.find((l) => groupKey(l) === groupKey(rule));
      return [
        rule.id,
        {
          ...rule,
          allowedPresentations: effectiveSalePresentations({
            packingModel: rule.packingModel ?? lot?.packingModel,
            blistersPerBox: rule.blistersPerBox ?? lot?.blistersPerBox,
            allowedPresentations: rule.allowedPresentations,
          }),
        },
      ];
    }),
  );
}
function ruleIssue(
  line: SalePreviewInput['lines'][number],
  rule: SalePlannerRule | undefined,
  production: boolean,
): SalePreviewIssue | null {
  if (!rule)
    return {
      lineKey: line.lineKey,
      issueCode: 'configuration_missing',
      message: 'El producto ya no está disponible. Actualiza el catálogo.',
    };
  if (production && !rule.confirmed)
    return {
      lineKey: line.lineKey,
      issueCode: 'packing_pending',
      message: 'Confirma el empaque del producto antes de vender.',
    };
  if (!rule.allowedPresentations.includes(line.presentation))
    return {
      lineKey: line.lineKey,
      issueCode: 'presentation_not_allowed',
      message: 'Esta presentación no está autorizada para el producto.',
    };
  return null;
}
const failed = (issue: SalePreviewIssue): PhysicalSalePlan => ({
  valid: false,
  issues: [issue],
  allocations: [],
  states: new Map(),
});

/** Pure simulation. Whole packages are reserved before any fragmentation.
 * FIFO remains receivedAt/createdAt/id inside each presentation. Stable original
 * line keys keep document order independent of physical planning order.
 * Temporary children exist only in this returned plan, never in PostgreSQL.
 */
export function planPhysicalSale(
  input: SalePreviewInput,
  stock: SalePlannerStock,
  options: { includeCosts?: boolean; newContainerId?: () => string } = {},
): PhysicalSalePlan {
  const rules = effectiveRules(stock);
  const byGroup = new Map<string, SalePlannerLot[]>();
  for (const lot of stock.lots) {
    const key = groupKey(lot),
      rows = byGroup.get(key) ?? [];
    rows.push(lot);
    byGroup.set(key, rows);
  }
  for (const rows of byGroup.values()) rows.sort((a, b) => a.fifoOrder - b.fifoOrder);
  const states = new Map<string, Map<string, ContainerStock>>();
  const allocations: PlannedSaleAllocation[] = [];
  const soldAt = Date.parse(input.soldAt);
  const lines = input.lines
    .map((line, index) => ({ ...line, index }))
    .sort((a, b) => rank[a.presentation] - rank[b.presentation] || a.index - b.index);
  for (const line of lines) {
    const rule = rules.get(line.configurationId);
    const issue = ruleIssue(line, rule, stock.requireConfirmedLots);
    if (issue) return failed(issue);
    let remaining = line.quantity,
      futureStock = false;
    for (const lot of byGroup.get(groupKey(rule!)) ?? []) {
      if (!remaining) break;
      if (!presentationCanUseLot(line.presentation, lot)) continue;
      let state = states.get(lot.id);
      if (!state) {
        state = new Map(lot.containers.map((c) => [c.id, { ...c }]));
        states.set(lot.id, state);
      }
      const unit = unitFor(line.presentation);
      const usePortions =
        (line.presentation === 'half_box' &&
          lot.packingModel === 'blister' &&
          (lot.blistersPerBox ?? 0) > 0) ||
        (line.presentation === 'blister' &&
          [...state.values()].some(
            (c) =>
              c.quantity > 0 &&
              (c.unit === 'box_fraction' ||
                (c.unit === 'prepared_half_box' && c.countedPieces === null)),
          ));
      if (usePortions) {
        const needed = line.presentation === 'blister' ? 2 : portionsPerBox(lot) / 2;
        const counted = [...state.values()].filter(
          (c) =>
            c.unit === unit && c.state === 'sealed' && c.quantity === 1 && c.countedPieces !== null,
        );
        const available =
          needed > 0 &&
          (counted.length > 0 ||
            [...state.values()].reduce((sum, c) => sum + containerPortions(c, lot), 0) >= needed);
        if (!available) continue;
        if (!(lot.receivedBeforeSale ?? Date.parse(lot.receivedAt) <= soldAt)) {
          futureStock = true;
          continue;
        }
        if (stock.requireConfirmedLots && !lot.confirmed)
          return failed({
            lineKey: line.lineKey,
            issueCode: 'packing_pending',
            message: 'Hay mercancía anterior cuyo empaque necesita confirmación.',
          });
        while (remaining > 0) {
          let selected = counted.shift();
          let costUsd: string | null;
          if (selected) costUsd = selected.costUsd ?? null;
          else {
            const part = takeCommercialPortions(state, lot, needed, options.includeCosts !== false);
            if (!part) break;
            costUsd = part.costUsd;
            const id =
              options.newContainerId?.() ??
              `preview:portion:${lot.id}:${line.lineKey}:${remaining}`;
            selected = {
              id,
              lotId: lot.id,
              warehouseId: part.source.warehouseId,
              parentId: null,
              kind: line.presentation === 'blister' ? 'blister' : 'half_box',
              unit,
              state: 'sealed',
              quantity: 1,
              countedPieces: null,
              version: 1,
              costUsd,
              portionSources: part.portionSources,
            };
            state.set(id, selected);
          }
          allocations.push({
            lineKey: line.lineKey,
            lotId: lot.id,
            containerId: selected.id,
            quantity: 1,
            costUsd,
          });
          selected.quantity = 0;
          selected.costUsd = '0.0000';
          selected.state = 'dispatched';
          if (selected.countedPieces !== null) selected.countedPieces = 0;
          remaining--;
        }
        continue;
      }
      const perBox =
        line.presentation === 'blister'
          ? (lot.blistersPerBox ?? 0)
          : line.presentation === 'half_box' && lot.packingModel === 'halves'
            ? 2
            : 0;
      const available = [...state.values()].filter((c) => c.quantity === 1 && c.state === 'sealed');
      const direct = available.filter((c) => c.unit === unit);
      const boxes = perBox > 0 ? available.filter((c) => c.unit === 'sealed_box') : [];
      let directIndex = 0,
        boxIndex = 0;
      if (!direct.length && !boxes.length) continue;
      if (!(lot.receivedBeforeSale ?? Date.parse(lot.receivedAt) <= soldAt)) {
        futureStock = true;
        continue;
      }
      if (stock.requireConfirmedLots && !lot.confirmed)
        return failed({
          lineKey: line.lineKey,
          issueCode: 'packing_pending',
          message: 'Hay mercancía anterior cuyo empaque necesita confirmación.',
        });
      while (remaining > 0) {
        let selected = direct[directIndex++];
        if (!selected && perBox > 0) {
          const box = boxes[boxIndex++];
          if (box) {
            const costs =
              options.includeCosts === false
                ? Array<string | null>(perBox).fill(null)
                : allocateCost(box.costUsd ?? null, Array<number>(perBox).fill(1));
            box.quantity = 0;
            box.costUsd = '0.0000';
            box.state = 'open';
            box.countedPieces = null;
            for (let slot = 0; slot < perBox; slot++) {
              const id = options.newContainerId?.() ?? `preview:${box.id}:${unit}:${slot}`;
              const child: ContainerStock = {
                id,
                lotId: lot.id,
                warehouseId: box.warehouseId,
                parentId: box.id,
                kind: unit === 'intact_blister' ? 'blister' : 'half_box',
                state: 'sealed',
                unit,
                quantity: 1,
                countedPieces: null,
                version: 1,
                costUsd: costs[slot],
              };
              state.set(id, child);
              if (slot === 0) selected = child;
              else direct.push(child);
            }
            // A failed queue read advanced the cursor before new children were
            // appended. The remaining children begin at the old queue length.
            directIndex--;
          }
        }
        if (!selected) break;
        allocations.push({
          lineKey: line.lineKey,
          lotId: lot.id,
          containerId: selected.id,
          quantity: 1,
          costUsd: selected.costUsd ?? null,
        });
        selected.quantity = 0;
        selected.costUsd = '0.0000';
        selected.state = 'dispatched';
        if (selected.countedPieces !== null) selected.countedPieces = 0;
        remaining--;
      }
    }
    if (remaining)
      return failed({
        lineKey: line.lineKey,
        issueCode: futureStock ? 'receipt_after_sale' : 'stock_insufficient',
        message: futureStock
          ? 'La fecha de venta es anterior a la recepción de la mercancía necesaria.'
          : line.presentation === 'half_box'
            ? 'No hay suficiente mercancía para las medias cajas de esta venta.'
            : 'No hay suficiente existencia física disponible para esta venta.',
      });
  }
  for (const state of states.values()) {
    const parentsWithStock = new Set(
      [...state.values()].filter((c) => c.quantity > 0).map((c) => c.parentId),
    );
    for (const c of state.values())
      if (c.kind === 'box' && c.state === 'open' && c.quantity === 0 && !parentsWithStock.has(c.id))
        c.state = 'empty';
  }
  return { valid: true, issues: [], allocations, states };
}

/** Maxima are conditional on all OTHER demands, never additive independent
 * equivalences. Group-local simulations and memoization bound work to requested
 * variants, and no SQL query or cost arithmetic occurs inside the search.
 */
export function previewPhysicalSale(
  input: SalePreviewInput,
  stock: SalePlannerStock,
  checkedAt: string,
): SalePreviewResult {
  const issues: SalePreviewIssue[] = [];
  const total = input.lines.reduce((sum, line) => sum + line.quantity, 0);
  if (total > 1000)
    issues.push({
      lineKey: null,
      issueCode: 'sale_limit_exceeded',
      message: 'Una venta admite hasta 1.000 presentaciones. Divide la operación.',
    });
  if (Date.parse(input.soldAt) > Date.parse(checkedAt))
    issues.push({
      lineKey: null,
      issueCode: 'future_sale_date',
      message: 'La venta no puede tener una fecha futura.',
    });
  const rules = effectiveRules(stock);
  const groups = new Map<
    string,
    { lines: SalePreviewInput['lines']; stock: SalePlannerStock; cache: Map<string, boolean> }
  >();
  const lots = new Map<string, SalePlannerLot[]>();
  for (const lot of stock.lots) {
    const key = groupKey(lot),
      rows = lots.get(key) ?? [];
    rows.push(lot);
    lots.set(key, rows);
  }
  for (const line of input.lines) {
    const rule = rules.get(line.configurationId);
    if (!rule) continue;
    const key = groupKey(rule);
    let group = groups.get(key);
    if (!group) {
      group = {
        lines: [],
        stock: {
          rules: [rule],
          lots: lots.get(key) ?? [],
          requireConfirmedLots: stock.requireConfirmedLots,
        },
        cache: new Map(),
      };
      groups.set(key, group);
    }
    if (!group.stock.rules.some((r) => r.id === rule.id)) group.stock.rules.push(rule);
    group.lines.push(line);
  }
  const lines = input.lines.map<SalePreviewResult['lines'][number]>((line) => {
    const rule = rules.get(line.configurationId);
    const ownIssue = ruleIssue(line, rule, stock.requireConfirmedLots);
    if (ownIssue)
      return {
        lineKey: line.lineKey,
        maxQuantity: 0,
        issueCode: ownIssue.issueCode,
        message: ownIssue.message,
      };
    const group = groups.get(groupKey(rule!))!;
    const ceiling = 1000 - (total - line.quantity);
    const feasible = (quantity: number) => {
      const candidate = group.lines.flatMap((other) =>
        other.lineKey === line.lineKey ? (quantity ? [{ ...other, quantity }] : []) : [other],
      );
      // Feasibility depends on aggregate physical demand, not how equal
      // presentations are split into invoice rows. Reuse the search for repeated
      // rows without changing the original line identities in the real plan.
      const demand = new Map<string, number>();
      for (const item of candidate) {
        const key = JSON.stringify([item.configurationId, item.presentation]);
        demand.set(key, (demand.get(key) ?? 0) + item.quantity);
      }
      const key = JSON.stringify([...demand.entries()].sort(([a], [b]) => a.localeCompare(b)));
      let value = group.cache.get(key);
      if (value === undefined) {
        value = planPhysicalSale({ soldAt: input.soldAt, lines: candidate }, group.stock, {
          includeCosts: false,
        }).valid;
        group.cache.set(key, value);
      }
      return value;
    };
    if (ceiling < 0 || !feasible(0))
      return {
        lineKey: line.lineKey,
        maxQuantity: null,
        issueCode: 'cart_conflict' as const,
        message: 'Corrige las otras cantidades del carrito para calcular este máximo.',
      };
    let low = 0,
      high = ceiling;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (feasible(mid)) low = mid;
      else high = mid - 1;
    }
    if (line.quantity <= low)
      return { lineKey: line.lineKey, maxQuantity: low, issueCode: null, message: null };
    const failure = planPhysicalSale({ soldAt: input.soldAt, lines: group.lines }, group.stock, {
      includeCosts: false,
    }).issues[0];
    const issueCode =
      failure?.issueCode === 'packing_pending' || failure?.issueCode === 'receipt_after_sale'
        ? failure.issueCode
        : 'stock_insufficient';
    return {
      lineKey: line.lineKey,
      maxQuantity: low,
      issueCode,
      message:
        issueCode === 'stock_insufficient'
          ? `Se actualizaron las existencias. Disponible para esta venta: ${low}. Revisa la cantidad.`
          : failure!.message,
    };
  });
  for (const line of lines)
    if (line.issueCode)
      issues.push({ lineKey: line.lineKey, issueCode: line.issueCode, message: line.message! });
  if (!issues.length) {
    const complete = planPhysicalSale(input, stock, { includeCosts: false });
    issues.push(...complete.issues);
  }
  return { checkedAt, reservesStock: false, valid: issues.length === 0, lines, issues };
}

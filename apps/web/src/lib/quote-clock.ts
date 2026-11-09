export type QuoteClock = { serverMs: number; monotonicMs: number };
/** Wall-clock changes on a phone do not alter the age of a verified quote. */
export function quoteNow(anchor?: QuoteClock, monotonic = performance.now(), wall = Date.now()) {
  return anchor && Number.isFinite(anchor.serverMs) && Number.isFinite(anchor.monotonicMs)
    ? anchor.serverMs + Math.max(0, monotonic - anchor.monotonicMs)
    : wall;
}

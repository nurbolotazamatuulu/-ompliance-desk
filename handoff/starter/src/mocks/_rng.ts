/**
 * Внутренний детерминированный RNG для всех мок-генераторов.
 * Один seed на весь проект — данные стабильны от перезагрузки к перезагрузке.
 *
 * Не экспортируется из barrel `./index` — это служебный модуль.
 */

let seed = 42;

export const rng = (): number => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

export const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];

export const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

export const pad = (n: number, w: number): string => String(n).padStart(w, '0');

export const isoDateBetween = (start: Date, end: Date): string => {
  const t = start.getTime() + rng() * (end.getTime() - start.getTime());
  return new Date(t).toISOString();
};

export const weighted = <T>(items: { s: T; w: number }[]): T => {
  const total = items.reduce((a, b) => a + b.w, 0);
  let r = rng() * total;
  for (const it of items) {
    if ((r -= it.w) <= 0) return it.s;
  }
  return items[0].s;
};

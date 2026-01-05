export type MultiplierRange = {
  minSize: number;
  maxSize: number;
  multiplier: number;
};

export const defaultMultiplierRanges: MultiplierRange[] = [
  { minSize: 0, maxSize: 29, multiplier: 1.0 },
  { minSize: 30, maxSize: 59, multiplier: 1.1 },
  { minSize: 60, maxSize: 99, multiplier: 1.25 },
  { minSize: 100, maxSize: 159, multiplier: 1.5 },
  { minSize: 160, maxSize: 999999, multiplier: 2.0 },
];

export function resolveMultiplier(sizeScore: number, ranges = defaultMultiplierRanges): number {
  for (const range of ranges) {
    if (sizeScore >= range.minSize && sizeScore <= range.maxSize) {
      return range.multiplier;
    }
  }

  return ranges.length > 0 ? ranges[ranges.length - 1].multiplier : 1;
}

export type HistogramSnapshot = {
  count: number;
  min: number | null;
  max: number | null;
  avg: number | null;
  p50: number | null;
  p95: number | null;
  last: number | null;
};

export type MetricsSnapshot = {
  startedAt: string;
  counters: Record<string, number>;
  gauges: Record<string, number>;
  histograms: Record<string, HistogramSnapshot>;
};

export type MetricsStore = {
  incCounter: (name: string, value?: number) => void;
  setGauge: (name: string, value: number) => void;
  observeHistogram: (name: string, value: number) => void;
  snapshot: () => MetricsSnapshot;
};

type MetricsOptions = {
  histogramSize?: number;
};

class RollingHistogram {
  private readonly size: number;
  private readonly values: number[];
  private index: number;
  private count: number;
  private sum: number;
  private last: number | null;

  constructor(size: number) {
    this.size = Math.max(1, Math.floor(size));
    this.values = [];
    this.index = 0;
    this.count = 0;
    this.sum = 0;
    this.last = null;
  }

  observe(value: number): void {
    if (!Number.isFinite(value)) {
      return;
    }

    this.last = value;

    if (this.count < this.size) {
      this.values.push(value);
      this.count += 1;
      this.sum += value;
      return;
    }

    const prev = this.values[this.index];
    this.values[this.index] = value;
    this.sum += value - prev;
    this.index = (this.index + 1) % this.size;
  }

  snapshot(): HistogramSnapshot {
    if (this.count === 0) {
      return {
        count: 0,
        min: null,
        max: null,
        avg: null,
        p50: null,
        p95: null,
        last: null,
      };
    }

    const sample = this.values.slice(0, this.count).sort((a, b) => a - b);
    const min = sample[0];
    const max = sample[sample.length - 1];
    const avg = this.sum / this.count;

    return {
      count: this.count,
      min,
      max,
      avg,
      p50: quantile(sample, 0.5),
      p95: quantile(sample, 0.95),
      last: this.last,
    };
  }
}

export function createMetricsStore(options: MetricsOptions = {}): MetricsStore {
  const startedAt = new Date().toISOString();
  const counters = new Map<string, number>();
  const gauges = new Map<string, number>();
  const histograms = new Map<string, RollingHistogram>();
  const histogramSize = options.histogramSize ?? 500;

  const incCounter = (name: string, value = 1): void => {
    if (!Number.isFinite(value)) {
      return;
    }

    const current = counters.get(name) ?? 0;
    counters.set(name, current + value);
  };

  const setGauge = (name: string, value: number): void => {
    if (!Number.isFinite(value)) {
      return;
    }

    gauges.set(name, value);
  };

  const observeHistogram = (name: string, value: number): void => {
    const histogram = histograms.get(name) ?? new RollingHistogram(histogramSize);
    histogram.observe(value);
    histograms.set(name, histogram);
  };

  const snapshot = (): MetricsSnapshot => ({
    startedAt,
    counters: Object.fromEntries(counters.entries()),
    gauges: Object.fromEntries(gauges.entries()),
    histograms: Object.fromEntries(
      Array.from(histograms.entries()).map(([key, histogram]) => [key, histogram.snapshot()]),
    ),
  });

  return {
    incCounter,
    setGauge,
    observeHistogram,
    snapshot,
  };
}

function quantile(sample: number[], p: number): number | null {
  if (sample.length === 0) {
    return null;
  }

  const idx = Math.min(sample.length - 1, Math.max(0, Math.ceil(p * sample.length) - 1));
  return sample[idx];
}

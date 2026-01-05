export class PointRing {
  private readonly cap: number;
  private readonly buf: Float32Array;
  private start = 0;
  private count = 0;

  constructor(capacityPoints: number) {
    this.cap = Math.max(16, capacityPoints | 0);
    this.buf = new Float32Array(this.cap * 2);
  }

  clear(): void {
    this.start = 0;
    this.count = 0;
  }

  size(): number {
    return this.count;
  }

  push(x: number, y: number): void {
    let index: number;
    if (this.count < this.cap) {
      index = (this.start + this.count) % this.cap;
      this.count += 1;
    } else {
      this.start = (this.start + 1) % this.cap;
      index = (this.start + this.count - 1) % this.cap;
    }
    const base = index * 2;
    this.buf[base] = x;
    this.buf[base + 1] = y;
  }

  popFront(): void {
    if (this.count <= 0) {
      return;
    }
    this.start = (this.start + 1) % this.cap;
    this.count -= 1;
  }

  get(index: number): [number, number] {
    const idx = (this.start + index) % this.cap;
    const base = idx * 2;
    return [this.buf[base], this.buf[base + 1]];
  }

  getHead(): [number, number] {
    if (this.count <= 0) {
      return [0, 0];
    }
    return this.get(this.count - 1);
  }

  forEach(cb: (x: number, y: number, index: number) => void): void {
    for (let i = 0; i < this.count; i += 1) {
      const idx = (this.start + i) % this.cap;
      const base = idx * 2;
      cb(this.buf[base], this.buf[base + 1], i);
    }
  }

  sample(maxPoints: number): number[] {
    const n = this.count;
    if (n <= 0) {
      return [];
    }
    if (n <= maxPoints) {
      const out = new Array(n * 2);
      let k = 0;
      for (let i = 0; i < n; i += 1) {
        const idx = (this.start + i) % this.cap;
        const base = idx * 2;
        out[k++] = this.buf[base];
        out[k++] = this.buf[base + 1];
      }
      return out;
    }

    const step = n / maxPoints;
    const out = new Array(maxPoints * 2);
    let k = 0;
    for (let i = 0; i < maxPoints; i += 1) {
      const src = Math.floor(i * step);
      const idx = (this.start + src) % this.cap;
      const base = idx * 2;
      out[k++] = this.buf[base];
      out[k++] = this.buf[base + 1];
    }
    return out;
  }
}

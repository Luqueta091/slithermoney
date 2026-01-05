export class PelletPool {
  readonly max: number;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly r: Float32Array;
  readonly v: Float32Array;
  readonly h: Uint16Array;
  readonly active: Uint8Array;
  private readonly free: number[] = [];

  constructor(maxPellets: number) {
    this.max = maxPellets | 0;
    this.x = new Float32Array(this.max);
    this.y = new Float32Array(this.max);
    this.r = new Float32Array(this.max);
    this.v = new Float32Array(this.max);
    this.h = new Uint16Array(this.max);
    this.active = new Uint8Array(this.max);
    for (let i = 0; i < this.max; i += 1) {
      this.free.push(i);
    }
  }

  spawn(x: number, y: number, radius: number, value: number, hue: number): number {
    if (this.free.length <= 0) {
      return -1;
    }
    const id = this.free.pop();
    if (id === undefined) {
      return -1;
    }
    this.x[id] = x;
    this.y[id] = y;
    this.r[id] = radius;
    this.v[id] = value;
    this.h[id] = hue;
    this.active[id] = 1;
    return id;
  }

  kill(id: number): boolean {
    if (id < 0 || id >= this.max) {
      return false;
    }
    if (this.active[id] === 0) {
      return false;
    }
    this.active[id] = 0;
    this.free.push(id);
    return true;
  }
}

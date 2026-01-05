export class SpatialHash<T = number> {
  private readonly cellSize: number;
  private readonly worldRadius: number;
  private readonly maxCell: number;
  private readonly cells = new Map<number, T[]>();

  constructor(cellSize: number, worldRadius: number) {
    this.cellSize = cellSize;
    this.worldRadius = worldRadius;
    this.maxCell = Math.ceil((worldRadius * 2) / cellSize) + 2;
  }

  clear(): void {
    this.cells.clear();
  }

  insert(x: number, y: number, item: T): void {
    const cx = this.cellCoord(x);
    const cy = this.cellCoord(y);
    const key = this.key(cx, cy);
    const bucket = this.cells.get(key);
    if (bucket) {
      bucket.push(item);
      return;
    }
    this.cells.set(key, [item]);
  }

  *queryNeighbors(x: number, y: number, radiusCells = 1): IterableIterator<T> {
    const cx0 = this.cellCoord(x);
    const cy0 = this.cellCoord(y);
    for (let dx = -radiusCells; dx <= radiusCells; dx += 1) {
      for (let dy = -radiusCells; dy <= radiusCells; dy += 1) {
        const cx = cx0 + dx;
        const cy = cy0 + dy;
        if (cx < 0 || cy < 0) {
          continue;
        }
        const key = this.key(cx, cy);
        const bucket = this.cells.get(key);
        if (!bucket) {
          continue;
        }
        for (let i = 0; i < bucket.length; i += 1) {
          yield bucket[i] as T;
        }
      }
    }
  }

  private cellCoord(value: number): number {
    return Math.floor((value + this.worldRadius) / this.cellSize);
  }

  private key(cx: number, cy: number): number {
    return cx * this.maxCell + cy;
  }
}

'use strict';

/**
 * Spatial hash 2D (grid) para consultas rápidas de vizinhança.
 * - cellSize controla granularidade.
 * - coordenadas devem estar em "world space".
 */
class SpatialHash {
  constructor(cellSize, worldRadius) {
    this.cellSize = cellSize;
    this.worldRadius = worldRadius;
    this.cells = new Map(); // key:number -> Array<item>
    this._maxCell = Math.ceil((worldRadius * 2) / cellSize) + 2;
  }

  _cellCoord(v) {
    // offset para ficar sempre >= 0
    return Math.floor((v + this.worldRadius) / this.cellSize);
  }

  _key(cx, cy) {
    // cx e cy pequenos -> chave inteira compacta
    return cx * this._maxCell + cy;
  }

  clear() {
    this.cells.clear();
  }

  insert(x, y, item) {
    const cx = this._cellCoord(x);
    const cy = this._cellCoord(y);
    const k = this._key(cx, cy);
    let bucket = this.cells.get(k);
    if (!bucket) {
      bucket = [];
      this.cells.set(k, bucket);
    }
    bucket.push(item);
  }

  /**
   * Itera itens nas células vizinhas do ponto (x,y).
   * radiusCells define quantas células ao redor (1 = 3x3).
   */
  *queryNeighbors(x, y, radiusCells = 1) {
    const cx0 = this._cellCoord(x);
    const cy0 = this._cellCoord(y);
    for (let dx = -radiusCells; dx <= radiusCells; dx++) {
      for (let dy = -radiusCells; dy <= radiusCells; dy++) {
        const cx = cx0 + dx;
        const cy = cy0 + dy;
        if (cx < 0 || cy < 0) continue;
        const k = this._key(cx, cy);
        const bucket = this.cells.get(k);
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) yield bucket[i];
      }
    }
  }
}

module.exports = { SpatialHash };

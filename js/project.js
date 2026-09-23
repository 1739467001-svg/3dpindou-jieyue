// ============================================================
// project.js — 拼豆工程数据模型（3D 体素文档）
//  layers[y] = Uint16Array(w*d)，值 = 色板索引+1（0 = 空钉）
//  工具操作 / 撤销重做 / 用量统计 / 悬空检测 / 钉板换算
// ============================================================

export const STANDARD_BOARD = 29; // 标准钉板 29×29
export const COOL_MS = 10000;     // 熨烫后真实冷却时间（现实里要完全冷却才能叠层）

export class BeadProject {
  /**
   * @param w 宽（格） @param d 深（格） @param h 高（层数）
   * @param palette 色板 { name, colors }
   */
  constructor(w, d, h, palette) {
    this.w = Math.max(1, Math.min(120, w | 0));
    this.d = Math.max(1, Math.min(120, d | 0));
    this.h = Math.max(1, Math.min(80, h | 0));
    this.palette = palette;
    this.layers = Array.from({ length: this.h }, () => new Uint16Array(this.w * this.d));
    this.current = 0;               // 当前编辑层
    this.iron = new Uint8Array(this.h); // 每层熨烫等级 0-3
    this.cool = new Float32Array(this.h).fill(1); // 每层冷却度 1=已冷 0=刚熨完发烫
    this.name = '未命名作品';
    this.history = [];
    this.future = [];
    this.listeners = [];
  }

  onChange(fn) { this.listeners.push(fn); }
  /** 推进冷却计时（ms），有层在降温时返回 true */
  tickCooling(dtMs) {
    let changed = false;
    for (let y = 0; y < this.h; y++) {
      if (this.cool[y] < 1) {
        this.cool[y] = Math.min(1, this.cool[y] + dtMs / COOL_MS);
        changed = true;
      }
    }
    return changed;
  }
  /** 某层是否还发烫 */
  isHot(y) { return this.cool[y] < 1; }
  /** 下方最近一层是否还烫（叠层警示用） */
  belowHot() {
    for (let y = this.current - 1; y >= 0; y--) {
      if (this.layers[y].some(v => v > 0)) return this.cool[y] < 1;
    }
    return false;
  }
  emit(type) { this.listeners.forEach(fn => fn(type, this)); }

  // ---------- 历史 ----------
  snapshot() {
    this.history.push({
      layers: this.layers.map(l => l.slice()),
      current: this.current,
      iron: this.iron.slice(),
      cool: this.cool.slice(),
    });
    if (this.history.length > 40) this.history.shift();
    this.future.length = 0;
  }
  undo() {
    const prev = this.history.pop();
    if (!prev) return false;
    this.future.push({
      layers: this.layers.map(l => l.slice()),
      current: this.current,
      iron: this.iron.slice(),
      cool: this.cool.slice(),
    });
    this.layers = prev.layers;
    this.current = Math.min(prev.current, this.h - 1);
    this.iron = prev.iron;
    this.cool = prev.cool;
    this.emit('undo');
    return true;
  }
  redo() {
    const next = this.future.pop();
    if (!next) return false;
    this.history.push({
      layers: this.layers.map(l => l.slice()),
      current: this.current,
      iron: this.iron.slice(),
      cool: this.cool.slice(),
    });
    this.layers = next.layers;
    this.current = Math.min(next.current, this.h - 1);
    this.iron = next.iron;
    this.cool = next.cool;
    this.emit('redo');
    return true;
  }

  // ---------- 格子读写 ----------
  idx(x, z) { return z * this.w + x; }
  inBounds(x, z) { return x >= 0 && z >= 0 && x < this.w && z < this.d; }
  get(x, z, y = this.current) {
    if (y < 0 || y >= this.h || !this.inBounds(x, z)) return 0;
    return this.layers[y][this.idx(x, z)];
  }
  set(x, z, v, y = this.current) {
    if (!this.inBounds(x, z) || y < 0 || y >= this.h) return;
    this.layers[y][this.idx(x, z)] = v;
  }
  get layer() { return this.layers[this.current]; }

  // ---------- 工具 ----------
  /** 画笔：以 (x,z) 为中心、半径为 r 的圆盘 */
  paint(x, z, colorIdx, r = 0) {
    const v = colorIdx + 1;
    if (r <= 0) { this.set(x, z, v); return; }
    const rr = r * r;
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dz * dz <= rr) this.set(x + dx, z + dz, v);
      }
    }
  }
  erase(x, z, r = 0) {
    if (r <= 0) { this.set(x, z, 0); return; }
    const rr = r * r;
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dz * dz <= rr) this.set(x + dx, z + dz, 0);
      }
    }
  }
  /** 油漆桶：4 邻域 flood fill 同色区域 */
  fill(x, z, colorIdx) {
    const target = this.get(x, z);
    const v = colorIdx + 1;
    if (target === v) return;
    const stack = [[x, z]];
    const seen = new Uint8Array(this.w * this.d);
    while (stack.length) {
      const [cx, cz] = stack.pop();
      if (!this.inBounds(cx, cz)) continue;
      const i = this.idx(cx, cz);
      if (seen[i] || this.layers[this.current][i] !== target) continue;
      seen[i] = 1;
      this.layers[this.current][i] = v;
      stack.push([cx + 1, cz], [cx - 1, cz], [cx, cz + 1], [cx, cz - 1]);
    }
  }
  /** 换色：整层所有 colorIdx → newIdx */
  recolor(colorIdx, newIdx) {
    const from = colorIdx + 1, to = newIdx + 1;
    const l = this.layers[this.current];
    for (let i = 0; i < l.length; i++) if (l[i] === from) l[i] = to;
  }
  /** 直线（Bresenham） */
  line(x0, z0, x1, z1, colorIdx, r = 0) {
    let dx = Math.abs(x1 - x0), dz = Math.abs(z1 - z0);
    const sx = x0 < x1 ? 1 : -1, sz = z0 < z1 ? 1 : -1;
    let err = dx - dz;
    for (;;) {
      this.paint(x0, z0, colorIdx, r);
      if (x0 === x1 && z0 === z1) break;
      const e2 = 2 * err;
      if (e2 > -dz) { err -= dz; x0 += sx; }
      if (e2 < dx) { err += dx; z0 += sz; }
    }
  }
  /** 矩形（描边或填充） */
  rect(x0, z0, x1, z1, colorIdx, filled, r = 0) {
    const xa = Math.min(x0, x1), xb = Math.max(x0, x1);
    const za = Math.min(z0, z1), zb = Math.max(z0, z1);
    for (let z = za; z <= zb; z++) {
      for (let x = xa; x <= xb; x++) {
        const edge = x === xa || x === xb || z === za || z === zb;
        if (filled || edge) this.paint(x, z, colorIdx, r);
      }
    }
  }
  /** 镜像：水平(x)/垂直(z) 翻转当前层 */
  mirror(axis) {
    const l = this.layers[this.current];
    const copy = l.slice();
    for (let z = 0; z < this.d; z++) {
      for (let x = 0; x < this.w; x++) {
        const nx = axis === 'x' ? this.w - 1 - x : x;
        const nz = axis === 'z' ? this.d - 1 - z : z;
        l[this.idx(nx, nz)] = copy[this.idx(x, z)];
      }
    }
  }
  /** 径向对称：把当前层 1/N 扇形复制到整层（做花朵/雪花/球冠） */
  radial(n = 4) {
    const cx = (this.w - 1) / 2, cz = (this.d - 1) / 2;
    const src = this.layers[this.current].slice();
    const dst = this.layers[this.current];
    dst.fill(0);
    const ang = (2 * Math.PI) / n;
    for (let z = 0; z < this.d; z++) {
      for (let x = 0; x < this.w; x++) {
        const dx = x - cx, dz = z - cz;
        const r = Math.hypot(dx, dz);
        let a = Math.atan2(dz, dx);
        // 归一到第一个扇形（带 x 轴镜像，保证左右对称）
        let k = Math.floor((a + Math.PI) / ang);
        a = a - k * ang;
        // 采样源图（在归一化角度处取最近格）
        const sx = Math.round(cx + Math.cos(a) * r);
        const sz = Math.round(cz + Math.sin(a) * r);
        if (this.inBounds(sx, sz)) dst[this.idx(x, z)] = src[this.idx(sx, sz)];
      }
    }
  }
  clearLayer() { this.layers[this.current].fill(0); }
  addLayer() {
    if (this.h >= 80) return false;
    this.layers.splice(this.current + 1, 0, new Uint16Array(this.w * this.d));
    this.iron = new Uint8Array([...this.iron.slice(0, this.current + 1), 0, ...this.iron.slice(this.current + 1)]);
    this.cool = new Float32Array([...this.cool.slice(0, this.current + 1), 1, ...this.cool.slice(this.current + 1)]);
    this.h++;
    this.current++;
    this.emit('layers');
    return true;
  }
  duplicateLayer() {
    if (!this.addLayer()) return false;
    this.layers[this.current].set(this.layers[this.current - 1]);
    this.emit('layers');
    return true;
  }
  deleteLayer() {
    if (this.h <= 1) return false;
    this.layers.splice(this.current, 1);
    this.iron = new Uint8Array([...this.iron.slice(0, this.current), ...this.iron.slice(this.current + 1)]);
    this.h--;
    this.current = Math.max(0, this.current - 1);
    this.emit('layers');
    return true;
  }
  moveLayer(dir) {
    const t = this.current + dir;
    if (t < 0 || t >= this.h) return false;
    [this.layers[this.current], this.layers[t]] = [this.layers[t], this.layers[this.current]];
    [this.iron[this.current], this.iron[t]] = [this.iron[t], this.iron[this.current]];
    this.current = t;
    this.emit('layers');
    return true;
  }

  // ---------- 统计 ----------
  /** 用量 Map<paletteIdx, count> */
  usage() {
    const m = new Map();
    for (const l of this.layers) {
      for (let i = 0; i < l.length; i++) {
        if (l[i] > 0) m.set(l[i] - 1, (m.get(l[i] - 1) || 0) + 1);
      }
    }
    return m;
  }
  totalBeads() {
    let n = 0;
    for (const l of this.layers) for (let i = 0; i < l.length; i++) if (l[i] > 0) n++;
    return n;
  }
  /** 悬空豆：下方同位置没有豆（会掉） */
  floatingBeads() {
    let n = 0;
    for (let y = 1; y < this.h; y++) {
      const cur = this.layers[y], below = this.layers[y - 1];
      for (let i = 0; i < cur.length; i++) {
        if (cur[i] > 0 && below[i] === 0) n++;
      }
    }
    return n;
  }
  /** 实际占用范围（用于 3D 取景与尺寸） */
  bounds() {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let y = 0; y < this.h; y++) {
      const l = this.layers[y];
      for (let z = 0; z < this.d; z++) {
        for (let x = 0; x < this.w; x++) {
          if (l[this.idx(x, z)] > 0) {
            if (x < x0) x0 = x; if (x > x1) x1 = x;
            if (y < y0) y0 = y; if (y > y1) y1 = y;
            if (z < z0) z0 = z; if (z > z1) z1 = z;
          }
        }
      }
    }
    if (x1 < x0) return null;
    return { x0, x1, y0, y1, z0, z1 };
  }
  /** 钉板数量（29×29 标准板，按最大层面积算） */
  boardCount() {
    const b = this.bounds();
    if (!b) return { perLayer: 0, w: 0, d: 0 };
    const w = b.x1 - b.x0 + 1, d = b.z1 - b.z0 + 1;
    return {
      perLayer: Math.ceil(w / STANDARD_BOARD) * Math.ceil(d / STANDARD_BOARD),
      w, d,
    };
  }
  /** 物理尺寸（cm） */
  sizeText(diameterMm) {
    const b = this.bounds();
    if (!b) return '0×0×0cm';
    const mm = diameterMm || this.palette?.diameterMm || 2.6;
    const f = (n) => ((n * mm) / 10).toFixed(1);
    return `${f(b.x1 - b.x0 + 1)}×${f(b.y1 - b.y0 + 1)}×${f(b.z1 - b.z0 + 1)}cm`;
  }

  // ---------- 序列化 ----------
  toJSON() {
    return {
      version: 2,
      name: this.name,
      w: this.w, d: this.d, h: this.h,
      palette: { name: this.palette.name, colors: this.palette.colors },
      iron: [...this.iron],
      cool: [...this.cool],
      // 只序列化非空层，压缩体积
      layers: this.layers.map((l, y) => {
        const cells = [];
        for (let i = 0; i < l.length; i++) if (l[i] > 0) cells.push(i, l[i]);
        return cells;
      }),
    };
  }
  static fromJSON(obj) {
    const palette = {
      name: obj.palette?.name || '导入色板',
      colors: obj.palette?.colors || [],
    };
    const p = new BeadProject(obj.w, obj.d, obj.h, palette);
    p.name = obj.name || '导入作品';
    obj.layers.forEach((cells, y) => {
      if (y >= p.h) return;
      for (let i = 0; i < cells.length; i += 2) {
        p.layers[y][cells[i]] = cells[i + 1];
      }
    });
    if (obj.iron) p.iron = new Uint8Array(obj.iron);
    if (obj.cool) p.cool = new Float32Array(obj.cool);
    return p;
  }
}

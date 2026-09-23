// ============================================================
// editor2d.js — 2D 钉板编辑器（当前层的平面编辑视图）
// 现实映射：拼豆就是在钉板上逐格摆豆——编辑器就是一块数字钉板
// 工具：笔刷/橡皮/油漆桶/取色/换色/直线/矩形/抓手，支持镜像与径向对称
// ============================================================

import { STANDARD_BOARD } from './project.js';

const BOARD_BG = '#f2ead8';
const BOARD_LINE = 'rgba(33,27,20,0.16)';
const BOARD_EDGE = 'rgba(33,27,20,0.55)';
const PEG_COLOR = 'rgba(33,27,20,0.20)';

export class LayerCanvas {
  constructor(canvas, project) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.project = project;
    this.tool = 'brush';       // brush|eraser|fill|pick|recolor|line|rect|pan
    this.color = 0;            // 色板索引
    this.brush = 0;            // 半径（格）
    this.mirror = { x: false, z: false };
    this.zoom = 1;
    this.panX = 0; this.panY = 0;
    this.onEdit = null;        // (op) => void，用于同步 3D 与 BOM
    this.drag = null;          // { type, x0, z0, lastX, lastZ }
    this.hover = null;
    this.showCodes = false;

    canvas.addEventListener('pointerdown', (e) => this._down(e));
    canvas.addEventListener('pointermove', (e) => this._move(e));
    window.addEventListener('pointerup', (e) => this._up(e));
    canvas.addEventListener('pointerleave', () => { this.hover = null; this.redraw(); });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoom = Math.max(0.5, Math.min(6, this.zoom * (e.deltaY < 0 ? 1.15 : 0.87)));
      this.redraw();
    }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // ---------- 坐标换算 ----------
  get cellSize() {
    const { w, d } = this.project;
    const vw = this.canvas.clientWidth, vh = this.canvas.clientHeight;
    const base = Math.min(vw / w, vh / d);
    return base * this.zoom;
  }
  get originX() {
    const { w } = this.project;
    const cs = this.cellSize;
    return (this.canvas.clientWidth - w * cs) / 2 + this.panX;
  }
  get originY() {
    const { d } = this.project;
    const cs = this.cellSize;
    return (this.canvas.clientHeight - d * cs) / 2 + this.panY;
  }
  toCell(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const cs = this.cellSize;
    return {
      x: Math.floor((clientX - r.left - this.originX) / cs),
      z: Math.floor((clientY - r.top - this.originY) / cs),
    };
  }

  // ---------- 绘制 ----------
  redraw() {
    const { ctx, canvas, project } = this;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const vw = canvas.clientWidth, vh = canvas.clientHeight;
    if (canvas.width !== vw * dpr || canvas.height !== vh * dpr) {
      canvas.width = vw * dpr;
      canvas.height = vh * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, vw, vh);

    const cs = this.cellSize, ox = this.originX, oy = this.originY;
    const { w, d } = project;

    // 钉板底板
    ctx.fillStyle = BOARD_BG;
    ctx.fillRect(ox, oy, w * cs, d * cs);

    // 格子 + 豆子
    const layer = project.layer;
    for (let z = 0; z < d; z++) {
      for (let x = 0; x < w; x++) {
        const v = layer[z * w + x];
        const px = ox + x * cs, py = oy + z * cs;
        if (v > 0) {
          const c = project.palette.colors[v - 1];
          if (c) {
            ctx.fillStyle = c.hex;
            const pad = Math.max(0, cs * 0.06);
            roundRect(ctx, px + pad, py + pad, cs - pad * 2, cs - pad * 2, cs * 0.22);
            ctx.fill();
            // 中心孔
            if (cs > 6) {
              ctx.fillStyle = 'rgba(20,16,12,0.55)';
              ctx.beginPath();
              ctx.arc(px + cs / 2, py + cs / 2, Math.max(0.8, cs * 0.11), 0, 7);
              ctx.fill();
            }
            // 色号
            if (this.showCodes && cs >= 15) {
              ctx.fillStyle = textOn(c.hex);
              ctx.font = `700 ${Math.floor(cs * 0.3)}px Menlo, monospace`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(c.code, px + cs / 2, py + cs / 2 + cs * 0.32);
            }
          }
        } else {
          // 空钉：钉板孔
          ctx.fillStyle = 'rgba(33,27,20,0.10)';
          ctx.beginPath();
          ctx.arc(px + cs / 2, py + cs / 2, Math.max(0.6, cs * 0.09), 0, 7);
          ctx.fill();
        }
      }
    }

    // 网格线
    if (cs > 4) {
      ctx.strokeStyle = BOARD_LINE;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= w; x++) { ctx.moveTo(ox + x * cs, oy); ctx.lineTo(ox + x * cs, oy + d * cs); }
      for (let z = 0; z <= d; z++) { ctx.moveTo(ox, oy + z * cs); ctx.lineTo(ox + w * cs, oy + z * cs); }
      ctx.stroke();
    }

    // 29×29 钉板边界（实线/虚线交替）
    ctx.strokeStyle = BOARD_EDGE;
    ctx.lineWidth = 1.5;
    for (let bx = STANDARD_BOARD; bx < w; bx += STANDARD_BOARD) {
      ctx.setLineDash(bx % (STANDARD_BOARD * 2) === 0 ? [] : [5, 4]);
      ctx.beginPath(); ctx.moveTo(ox + bx * cs, oy); ctx.lineTo(ox + bx * cs, oy + d * cs); ctx.stroke();
    }
    for (let bz = STANDARD_BOARD; bz < d; bz += STANDARD_BOARD) {
      ctx.setLineDash(bz % (STANDARD_BOARD * 2) === 0 ? [] : [5, 4]);
      ctx.beginPath(); ctx.moveTo(ox, oy + bz * cs); ctx.lineTo(ox + w * cs, oy + bz * cs); ctx.stroke();
    }
    ctx.setLineDash([]);

    // 外框
    ctx.strokeStyle = '#211b14';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(ox, oy, w * cs, d * cs);

    // 悬空豆警示（当前层中没有下方支撑的格子——在 2D 视图标出）
    if (project.current > 0) {
      const below = project.layers[project.current - 1];
      ctx.fillStyle = 'rgba(221,75,38,0.28)';
      for (let z = 0; z < d; z++) {
        for (let x = 0; x < w; x++) {
          const i = z * w + x;
          if (layer[i] > 0 && below[i] === 0) ctx.fillRect(ox + x * cs, oy + z * cs, cs, cs);
        }
      }
    }

    // 拖拽预览（线/矩形）
    if (this.drag && (this.drag.type === 'line' || this.drag.type === 'rect')) {
      const { x0, z0, x1, z1 } = this.drag;
      ctx.strokeStyle = 'rgba(14,143,134,0.9)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      if (this.drag.type === 'line') {
        ctx.beginPath();
        ctx.moveTo(ox + (x0 + 0.5) * cs, oy + (z0 + 0.5) * cs);
        ctx.lineTo(ox + (x1 + 0.5) * cs, oy + (z1 + 0.5) * cs);
        ctx.stroke();
      } else {
        const xa = Math.min(x0, x1), xb = Math.max(x0, x1);
        const za = Math.min(z0, z1), zb = Math.max(z0, z1);
        ctx.strokeRect(ox + xa * cs, oy + za * cs, (xb - xa + 1) * cs, (zb - za + 1) * cs);
      }
      ctx.setLineDash([]);
    }

    // 镜像轴
    if (this.mirror.x || this.mirror.z) {
      ctx.strokeStyle = 'rgba(230,162,60,0.85)';
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 5]);
      if (this.mirror.x) {
        ctx.beginPath(); ctx.moveTo(ox + w * cs / 2, oy); ctx.lineTo(ox + w * cs / 2, oy + d * cs); ctx.stroke();
      }
      if (this.mirror.z) {
        ctx.beginPath(); ctx.moveTo(ox, oy + d * cs / 2); ctx.lineTo(ox + w * cs, oy + d * cs / 2); ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // 悬停光标
    if (this.hover) {
      const { x, z } = this.hover;
      if (project.inBounds(x, z)) {
        ctx.strokeStyle = 'rgba(33,27,20,0.75)';
        ctx.lineWidth = 2;
        const r = this.brush;
        ctx.strokeRect(ox + (x - r) * cs, oy + (z - r) * cs, (r * 2 + 1) * cs, (r * 2 + 1) * cs);
      }
    }

    // 层标签
    ctx.fillStyle = 'rgba(33,27,20,0.55)';
    ctx.font = '600 11px Menlo, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`第 ${project.current + 1}/${project.h} 层 · ${w}×${d}`, ox + 4, oy + 4);
  }

  // ---------- 输入 ----------
  _down(e) {
    const { x, z } = this.toCell(e.clientX, e.clientY);
    if (this.tool === 'pan' || e.button === 1 || e.button === 2) {
      this.drag = { type: 'pan', sx: e.clientX, sy: e.clientY, panX: this.panX, panY: this.panY };
      return;
    }
    if (!this.project.inBounds(x, z)) return;
    const p = this.project;
    if (this.tool === 'pick') {
      const v = p.get(x, z);
      if (v > 0) { this.color = v - 1; this.onEdit?.('pick'); }
      return;
    }
    if (this.tool === 'recolor') {
      const v = p.get(x, z);
      if (v > 0 && v - 1 !== this.color) { p.snapshot(); p.recolor(v - 1, this.color); this.onEdit?.('recolor'); }
      return;
    }
    if (this.tool === 'fill') { p.snapshot(); p.fill(x, z, this.color); this.onEdit?.('fill'); return; }
    if (this.tool === 'line' || this.tool === 'rect') {
      p.snapshot();
      this.drag = { type: this.tool, x0: x, z0: z, x1: x, z1: z, before: p.layer.slice() };
      return;
    }
    // 笔刷 / 橡皮
    p.snapshot();
    this.drag = { type: this.tool, x0: x, z0: z, lastX: x, lastZ: z };
    this._stroke(x, z);
  }

  _move(e) {
    const { x, z } = this.toCell(e.clientX, e.clientY);
    this.hover = { x, z };
    if (!this.drag) { this.redraw(); return; }
    const p = this.project;
    if (this.drag.type === 'pan') {
      this.panX = this.drag.panX + (e.clientX - this.drag.sx);
      this.panY = this.drag.panY + (e.clientY - this.drag.sy);
      this.redraw();
      return;
    }
    if (this.drag.type === 'line' || this.drag.type === 'rect') {
      this.drag.x1 = x; this.drag.z1 = z;
      this.redraw();
      return;
    }
    // 笔刷/橡皮：连线补点，避免快速拖动断格
    if (x !== this.drag.lastX || z !== this.drag.lastZ) {
      this._lineTo(x, z);
      this.drag.lastX = x; this.drag.lastZ = z;
      this.onEdit?.('stroke');
    }
  }

  _up(e) {
    if (!this.drag) return;
    const p = this.project;
    if (this.drag.type === 'line' || this.drag.type === 'rect') {
      const { x0, z0, x1, z1, before } = this.drag;
      p.layer.set(before); // 还原预览，正式提交
      if (this.drag.type === 'line') p.line(x0, z0, x1, z1, this.color, this.brush);
      else p.rect(x0, z0, x1, z1, this.color, e.shiftKey, this.brush);
      this.onEdit?.('shape');
    } else if (this.drag.type === 'brush' || this.drag.type === 'eraser') {
      this.onEdit?.('stroke-end');
    }
    this.drag = null;
    this.redraw();
  }

  _stroke(x, z) {
    const p = this.project;
    const apply = (cx, cz) => {
      if (!p.inBounds(cx, cz)) return;
      if (this.tool === 'eraser') p.erase(cx, cz, this.brush);
      else p.paint(cx, cz, this.color, this.brush);
    };
    apply(x, z);
    if (this.mirror.x) apply(p.w - 1 - x, z);
    if (this.mirror.z) apply(x, p.d - 1 - z);
    if (this.mirror.x && this.mirror.z) apply(p.w - 1 - x, p.d - 1 - z);
    this.onEdit?.('stroke');
  }

  _lineTo(x, z) {
    const { lastX, lastZ } = this.drag;
    let dx = Math.abs(x - lastX), dz = Math.abs(z - lastZ);
    const sx = lastX < x ? 1 : -1, sz = lastZ < z ? 1 : -1;
    let err = dx - dz, cx = lastX, cz = lastZ;
    for (;;) {
      this._stroke(cx, cz);
      if (cx === x && cz === z) break;
      const e2 = 2 * err;
      if (e2 > -dz) { err -= dz; cx += sx; }
      if (e2 < dx) { err += dx; cz += sz; }
    }
  }

  resetView() { this.zoom = 1; this.panX = 0; this.panY = 0; this.redraw(); }
}

// ---------- 工具函数 ----------
function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
function textOn(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return '#fff';
  const [r, g, b] = [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
  return r * 0.299 + g * 0.587 + b * 0.114 > 150 ? '#211b14' : '#f6f0e3';
}

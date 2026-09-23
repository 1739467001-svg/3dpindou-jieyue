// ============================================================
// voxel.js — 球面反投影（ERP → 点云）与体素化（点云 → 拼豆）
// 与影石研究院 DAP 的 depth2point 流程同构：
//   像素(u,v) → 方向向量 × 深度 → 三维点 → 体素网格
// ============================================================

const PI = Math.PI;

/**
 * 将 ERP 全景图 + 深度图反投影为点云
 * @param imgData 工作分辨率下的 RGBA
 * @param depth   0..1 相对深度（1 = 近）
 * @param w,h     工作分辨率
 * @param opts    { near, far, bgCut, groundKeep(deg), stride }
 * @returns { pos: Float32Array(3n), col: Float32Array(3n), n }
 */
export function unproject(imgData, depth, w, h, opts) {
  const { near, far, bgCut, groundKeep, stride = 2 } = opts;
  const groundRad = -groundKeep * PI / 180;   // 低于该纬度视为地面远端，剔除
  const cap = Math.floor(w / stride) * Math.floor(h / stride);
  const pos = new Float32Array(cap * 3);
  const col = new Float32Array(cap * 3);
  let n = 0;
  for (let y = 0; y < h; y += stride) {
    const v = (y + 0.5) / h;
    const lat = (0.5 - v) * PI;                 // 上为正
    if (lat < groundRad) continue;              // 底座之外的地面剔除
    const cosLat = Math.cos(lat), sinLat = Math.sin(lat);
    for (let x = 0; x < w; x += stride) {
      const d = depth[y * w + x];
      if (d < bgCut) continue;                  // 背景剔除（天空/远景）
      const u = (x + 0.5) / w;
      const lon = u * 2 * PI - PI;
      const r = near + (1 - d) * (far - near);  // d=1 → near；d=0 → far
      const dirX = cosLat * Math.sin(lon);
      const dirY = sinLat;
      const dirZ = cosLat * Math.cos(lon);
      const i3 = n * 3;
      pos[i3] = dirX * r;
      pos[i3 + 1] = dirY * r;
      pos[i3 + 2] = dirZ * r;
      const pi = (y * w + x) * 4;
      col[i3] = imgData[pi];
      col[i3 + 1] = imgData[pi + 1];
      col[i3 + 2] = imgData[pi + 2];
      n++;
    }
  }
  return { pos: pos.subarray(0, n * 3), col: col.subarray(0, n * 3), n };
}

/**
 * 点云 → 体素网格（拼豆位）
 * 返回 beads: [{x,y,z,r,g,b}]（网格坐标，y 向上，0 = 底层）
 */
export function voxelize(points, gridN, opts = {}) {
  const { minCountRatio = 0.18 } = opts;
  const { pos, col, n } = points;
  if (n === 0) return { beads: [], gridN, cells: 0 };

  // 1. 包围盒（水平居中，便于旋转展示）
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  const extX = maxX - minX, extY = maxY - minY, extZ = maxZ - minZ;
  const extMax = Math.max(extX, extY, extZ, 1e-6);
  const cell = extMax / gridN;

  // 2. 累积到体素
  const NN = gridN * gridN * gridN;
  const cnt = new Uint16Array(NN);
  const sumR = new Float32Array(NN), sumG = new Float32Array(NN), sumB = new Float32Array(NN);
  for (let i = 0; i < n; i++) {
    const gx = Math.min(gridN - 1, Math.max(0, Math.floor((pos[i * 3] - minX + (extMax - extX) / 2) / cell)));
    const gy = Math.min(gridN - 1, Math.max(0, Math.floor((pos[i * 3 + 1] - minY) / cell)));
    const gz = Math.min(gridN - 1, Math.max(0, Math.floor((pos[i * 3 + 2] - minZ + (extMax - extZ) / 2) / cell)));
    const k = (gy * gridN + gz) * gridN + gx;
    cnt[k]++;
    sumR[k] += col[i * 3]; sumG[k] += col[i * 3 + 1]; sumB[k] += col[i * 3 + 2];
  }

  // 3. 统计占据体素的计数分布，自适应阈值去散点
  let occupied = 0, sum = 0;
  for (let k = 0; k < NN; k++) if (cnt[k] > 0) { occupied++; sum += cnt[k]; }
  const mean = sum / Math.max(1, occupied);
  const minCount = Math.max(1, Math.round(mean * minCountRatio));

  // 4. 生成豆子（带邻域检查的孤立剔除）
  const beads = [];
  const at = (x, y, z) => (x < 0 || y < 0 || z < 0 || x >= gridN || y >= gridN || z >= gridN)
    ? 0 : cnt[(y * gridN + z) * gridN + x];
  for (let gy = 0; gy < gridN; gy++) {
    for (let gz = 0; gz < gridN; gz++) {
      for (let gx = 0; gx < gridN; gx++) {
        const k = (gy * gridN + gz) * gridN + gx;
        const c = cnt[k];
        if (c < minCount) continue;
        // 面相邻计数 < 2 → 孤立噪点
        const nb = at(gx + 1, gy, gz) + at(gx - 1, gy, gz) + at(gx, gy + 1, gz)
          + at(gx, gy - 1, gz) + at(gx, gy, gz + 1) + at(gx, gy, gz - 1);
        if (nb < 2) continue;
        beads.push({
          x: gx, y: gy, z: gz,
          r: Math.round(sumR[k] / c),
          g: Math.round(sumG[k] / c),
          b: Math.round(sumB[k] / c),
        });
      }
    }
  }
  return { beads, gridN, cells: occupied };
}

/**
 * 豆子按品牌色板量化 + 可选限色
 * @returns { beads: [{x,y,z,p}], usage: Map<paletteIdx,count> }
 */
export function quantizeBeads(beads, matcher, maxColors = 0) {
  const counts = new Map();
  const idx = new Uint8Array(beads.length);
  for (let i = 0; i < beads.length; i++) {
    const b = beads[i];
    const p = matcher.match(b.r, b.g, b.b);
    idx[i] = p;
    counts.set(p, (counts.get(p) || 0) + 1);
  }
  let finalIdx = idx;
  if (maxColors > 0 && counts.size > maxColors) {
    // 动态导入避免循环依赖
    const { greedyLimit } = paletteModule;
    const remap = greedyLimit(counts, matcher.palette, maxColors);
    const newCounts = new Map();
    for (let i = 0; i < idx.length; i++) {
      const p = remap.get(idx[i]) ?? idx[i];
      idx[i] = p;
      newCounts.set(p, (newCounts.get(p) || 0) + 1);
    }
    finalIdx = idx;
    counts.clear();
    for (const [k, v] of newCounts) counts.set(k, v);
  }
  const out = beads.map((b, i) => ({ x: b.x, y: b.y, z: b.z, p: finalIdx[i] }));
  return { beads: out, usage: counts };
}

// 延迟绑定，避免 palette.js ←→ voxel.js 循环 import
import * as paletteModule from './palette.js';

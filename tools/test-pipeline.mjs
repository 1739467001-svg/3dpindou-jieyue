// Node 端验证流水线数学：合成 ERP + 深度 → 反投影 → 体素化 → 色板量化
import { unproject, voxelize, quantizeBeads } from '../js/voxel.js';
import { PALETTES, PaletteMatcher } from '../js/palette.js';

// 合成一个"球体在地面上方"的 ERP 场景（无纹理纯色，便于验证几何）
const W = 512, H = 256;
const img = new Uint8ClampedArray(W * H * 4);
const depth = new Float32Array(W * H);
const cx = 0, cy = 0.6, cz = 0, R = 0.4;    // 球心与半径（米），相机在球外
for (let y = 0; y < H; y++) {
  const lat = (0.5 - (y + 0.5) / H) * Math.PI;
  for (let x = 0; x < W; x++) {
    const lon = ((x + 0.5) / W) * 2 * Math.PI - Math.PI;
    const dx = Math.cos(lat) * Math.sin(lon), dy = Math.sin(lat), dz = Math.cos(lat) * Math.cos(lon);
    // 光线-球体求交（相机在原点）
    const b = -2 * cy * dy;
    const c = cy * cy - R * R;
    const disc = b * b - 4 * c;
    let d, r, g, bl;
    if (disc >= 0) {
      const t = (-b - Math.sqrt(disc)) / 2;
      if (t > 0) { d = t; r = 220; g = 60; bl = 50; }        // 球：红色
      else { d = 12; r = 120; g = 160; bl = 210; }           // 球后：天空
    } else if (dy < -0.05) {
      const t = -0.8 / dy;                                    // 地面：y = -0.8
      d = t; r = 90; g = 130; bl = 70;                        // 地：绿色
    } else {
      d = 12; r = 120; g = 160; bl = 210;                     // 天空：蓝色
    }
    // 深度 → 0..1（1=近），范围 [0.5, 1.2] 米
    const dn = Math.max(0, Math.min(1, (14 - d) / 13.5));
    depth[y * W + x] = dn;
    const i = (y * W + x) * 4;
    img[i] = r; img[i + 1] = g; img[i + 2] = bl; img[i + 3] = 255;
  }
}

// 深度归一化（与 depth.js 相同的分位归一化）
const sorted = Float32Array.from(depth).sort();
const lo = sorted[Math.floor(sorted.length * 0.01)];
const hi = sorted[Math.floor(sorted.length * 0.99)];
for (let i = 0; i < depth.length; i++) depth[i] = Math.max(0, Math.min(1, (depth[i] - lo) / Math.max(1e-6, hi - lo)));

const t0 = performance.now();
const pts = unproject(img, depth, W, H, { near: 0.45, far: 1.0, bgCut: 0.05, groundKeep: 55, stride: 1 });
const t1 = performance.now();
console.log(`反投影: ${pts.n} 点 (${(t1 - t0).toFixed(1)}ms)`);

const { beads, gridN } = voxelize(pts, 48);
const t2 = performance.now();
console.log(`体素化: ${beads.length} 豆 / 48³ (${(t2 - t1).toFixed(1)}ms)`);

// 几何正确性：球应占据中心、悬空（底层是地面）
let minY = 99, maxY = -1, center = 0;
for (const b of beads) { minY = Math.min(minY, b.y); maxY = Math.max(maxY, b.y); }
const mid = beads.filter(b => b.y > (minY + maxY) / 2);
center = mid.reduce((s, b) => s + b.x, 0) / Math.max(1, mid.length);
console.log(`层范围: ${minY}..${maxY}, 上半部分平均 x = ${center.toFixed(1)} (期望≈24, 即网格中心)`);

// 颜色正确性：球(红)在地(绿)上方
const redBeads = beads.filter(b => b.r > 150 && b.g < 100);
const greenBeads = beads.filter(b => b.g > 100 && b.r < 120);
console.log(`红色豆(球): ${redBeads.length}, 绿色豆(地): ${greenBeads.length}`);
if (redBeads.length && greenBeads.length) {
  const avgRedY = redBeads.reduce((s, b) => s + b.y, 0) / redBeads.length;
  const avgGreenY = greenBeads.reduce((s, b) => s + b.y, 0) / greenBeads.length;
  console.log(`红平均层 ${avgRedY.toFixed(1)} > 绿平均层 ${avgGreenY.toFixed(1)} → ${avgRedY > avgGreenY ? '✅ 球在地面上方' : '❌ 错误'}`);
}

// 色板量化
const matcher = new PaletteMatcher(PALETTES.orbit72);
const { beads: qb, usage } = quantizeBeads(beads, matcher);
const t3 = performance.now();
console.log(`色板量化: ${qb.length} 豆, 用到 ${usage.size} 色 (${(t3 - t2).toFixed(1)}ms)`);
const top = [...usage.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)
  .map(([i, c]) => `${PALETTES.orbit72.colors[i].code}(${PALETTES.orbit72.colors[i].name})×${c}`);
console.log('TOP4 色号:', top.join(', '));
console.log(`LUT 命中率: ${(matcher.stats.hits / (matcher.stats.hits + matcher.stats.misses) * 100).toFixed(1)}%`);

// CIEDE2000  sanity：同色距离 0，红绿距离应远
const { ciede2000, hexToLab } = await import('../js/palette.js');
const [lr, lg] = [hexToLab('#ff0000'), hexToLab('#00ff00')];
const dSame = ciede2000(...hexToLab('#123456'), ...hexToLab('#123456'));
console.log(`CIEDE2000: 同色=${dSame.toFixed(3)} (期望0), 红-绿=${ciede2000(...lr, ...lg).toFixed(1)} (期望>100)`);

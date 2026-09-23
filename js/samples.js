// ============================================================
// samples.js — 程序化 360° 全景场景生成器
// 用一个小型光线追踪器把分析几何体（球/盒/柱/锥/环）渲染成
// ERP 等距柱状投影全景图，作为工坊的示例素材与"文字造景"引擎
// （DiT360「文字→全景」理念的离线程序化实现）
// ============================================================

// ---------- 噪声 ----------
function hash3(x, y, z) {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263 + (z | 0) * 1274126177;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}
function smooth(t) { return t * t * (3 - 2 * t); }
function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = smooth(x - xi), yf = smooth(y - yi), zf = smooth(z - zi);
  let acc = 0;
  for (let dz = 0; dz <= 1; dz++) for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) {
    const w = (dx ? xf : 1 - xf) * (dy ? yf : 1 - yf) * (dz ? zf : 1 - zf);
    acc += w * hash3(xi + dx, yi + dy, zi + dz);
  }
  return acc;
}
function fbm(x, y, z, oct = 4) {
  let v = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { v += amp * noise3(x * f, y * f, z * f); amp *= 0.5; f *= 2.03; }
  return v;
}

// ---------- 光线求交 ----------
function hitSphere(o, d, s) { // o=origin(0), d=dir, s={c,r,sy?,pattern?}
  const cx = s.c[0], cy = s.c[1], cz = s.c[2];
  const sy = s.sy || 1;
  const ox = o[0] - cx, oy = (o[1] - cy) / sy, oz = o[2] - cz;
  const dx = d[0], dy = d[1] / sy, dz = d[2];
  const a = dx * dx + dy * dy + dz * dz;
  const b = 2 * (ox * dx + oy * dy + oz * dz);
  const c = ox * ox + oy * oy + oz * oz - s.r * s.r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  if (t > 1e-4) return t;
  const t2 = (-b + Math.sqrt(disc)) / (2 * a);
  return t2 > 1e-4 ? t2 : -1;
}
function hitBox(o, d, b) {
  let tmin = 0, tmax = Infinity;
  for (let i = 0; i < 3; i++) {
    const inv = 1 / (d[i] || 1e-9);
    let t0 = (b.min[i] - o[i]) * inv, t1 = (b.max[i] - o[i]) * inv;
    if (t0 > t1) [t0, t1] = [t1, t0];
    tmin = Math.max(tmin, t0); tmax = Math.min(tmax, t1);
    if (tmax < tmin) return -1;
  }
  return tmin > 1e-4 ? tmin : -1;
}
function hitCylinder(o, d, c) { // y 轴圆柱
  const a = d[0] * d[0] + d[2] * d[2];
  const b = 2 * (o[0] * d[0] + o[2] * d[2]);
  const cc = o[0] * o[0] + o[2] * o[2] - c.r * c.r;
  const disc = b * b - 4 * a * cc;
  if (disc < 0 || a < 1e-9) return -1;
  for (const t of [(-b - Math.sqrt(disc)) / (2 * a), (-b + Math.sqrt(disc)) / (2 * a)]) {
    if (t > 1e-4) {
      const y = o[1] + t * d[1];
      if (y >= c.y0 && y <= c.y1) return t;
    }
  }
  return -1;
}
function hitCone(o, d, c) { // y 轴圆台（顶点在上）
  const h = c.y1 - c.y0;
  const s = 1 + c.y0 / h;
  const A = d[0] * d[0] + d[2] * d[2];
  const B = c.r * c.r * d[1] * d[1] / (h * h);
  const qa = A - B;
  const qb = 2 * c.r * c.r * s * d[1] / h;
  const qc = -c.r * c.r * s * s;
  let t = -1;
  if (Math.abs(qa) < 1e-9) { if (Math.abs(qb) > 1e-9) t = -qc / qb; }
  else {
    const disc = qb * qb - 4 * qa * qc;
    if (disc >= 0) {
      for (const tt of [(-qb - Math.sqrt(disc)) / (2 * qa), (-qb + Math.sqrt(disc)) / (2 * qa)]) {
        if (tt > 1e-4) { const y = o[1] + tt * d[1]; if (y >= c.y0 && y <= c.y1) { t = tt; break; } }
      }
    }
  }
  return t;
}
function hitRing(o, d, g) { // xz 平面圆环
  if (Math.abs(d[1]) < 1e-9) return -1;
  const t = (g.y - o[1]) / d[1];
  if (t <= 1e-4) return -1;
  const x = o[0] + t * d[0], z = o[2] + t * d[2];
  const r2 = x * x + z * z;
  return r2 >= g.r0 * g.r0 && r2 <= g.r1 * g.r1 ? t : -1;
}
function hitPlane(o, d, y) {
  if (d[1] >= -1e-9) return -1;
  const t = (y - o[1]) / d[1];
  return t > 1e-4 ? t : -1;
}

// ---------- 场景定义 ----------
const SUN = (() => { const v = [0.45, 0.62, 0.35]; const l = Math.hypot(...v); return v.map(x => x / l); })();

const PRESETS = {
  mushroom: {
    ground: -1.25, groundColor: (x, z) => {
      const n = fbm(x * 3.1, 0, z * 3.1, 3);
      return [52 + n * 40, 96 + n * 55, 44 + n * 30];
    },
    sky: (dy) => {
      const t = Math.max(0, dy);
      return [120 + 90 * t, 165 + 70 * t, 215 + 35 * t];
    },
    fog: 0.16,
    objs: [
      // 大蘑菇：柄 + 伞盖 + 门
      { t: 'cyl', y0: -1.25, y1: 0.35, r: 0.34, color: [238, 226, 200] },
      { t: 'sph', c: [0, 0.42, 0], r: 0.82, sy: 0.62, pattern: (p) => {
        const n = noise3(p[0] * 5, p[1] * 5, p[2] * 5);
        return n > 0.62 ? [250, 246, 235] : [206, 44, 30];
      } },
      { t: 'box', min: [-0.17, -1.25, 0.2], max: [0.17, -0.5, 0.55], color: [92, 60, 40] },
      { t: 'sph', c: [0, -0.42, 0.44], r: 0.09, color: [250, 220, 120] },
      // 小蘑菇
      { t: 'cyl', y0: -1.25, y1: -0.75, r: 0.12, color: [238, 226, 200] },
      { t: 'sph', c: [1.05, -0.72, 0.6], r: 0.3, sy: 0.55, color: [224, 96, 60] },
      { t: 'cyl', y0: -1.25, y1: -0.8, r: 0.1, color: [238, 226, 200] },
      { t: 'sph', c: [-1.15, -0.78, -0.5], r: 0.26, sy: 0.55, color: [232, 150, 70] },
      { t: 'cyl', y0: -1.25, y1: -0.85, r: 0.08, color: [238, 226, 200] },
      { t: 'sph', c: [-0.7, -0.83, 1.2], r: 0.2, sy: 0.55, color: [206, 44, 30] },
      // 石头
      { t: 'sph', c: [0.9, -1.13, -1.0], r: 0.14, sy: 0.7, color: [140, 138, 130] },
      { t: 'sph', c: [-1.3, -1.16, 0.9], r: 0.1, sy: 0.7, color: [150, 148, 140] },
    ],
  },
  robot: {
    ground: -1.25, groundColor: (x, z) => {
      const n = fbm(x * 2.2, 5, z * 2.2, 3);
      const g = 88 + n * 30;
      return [g, g + 3, g + 8];
    },
    sky: (dy) => [96 + 70 * Math.max(0, dy), 120 + 70 * Math.max(0, dy), 160 + 60 * Math.max(0, dy)],
    fog: 0.1,
    objs: [
      { t: 'box', min: [-0.42, -1.25, -0.3], max: [0.42, -0.55, 0.3], color: [64, 78, 96] },      // 腿
      { t: 'cyl', y0: -1.3, y1: -1.18, r: 0.3, color: [40, 44, 52] }, { t: 'cyl', y0: -1.3, y1: -1.18, r: 0.3, color: [40, 44, 52] },
      { t: 'box', min: [-0.55, -0.6, -0.38], max: [0.55, 0.35, 0.38], color: [46, 140, 160] },   // 身体
      { t: 'box', min: [-0.2, -0.35, 0.38], max: [0.2, 0.1, 0.46], color: [250, 224, 120] },     // 胸灯
      { t: 'cyl', y0: 0.35, y1: 0.5, r: 0.09, color: [64, 78, 96] },                              // 颈
      { t: 'box', min: [-0.34, 0.5, -0.3], max: [0.34, 0.92, 0.3], color: [52, 158, 178] },       // 头
      { t: 'sph', c: [-0.15, 0.74, 0.28], r: 0.075, color: [240, 250, 255] },                     // 眼
      { t: 'sph', c: [0.15, 0.74, 0.28], r: 0.075, color: [240, 250, 255] },
      { t: 'cyl', y0: 0.92, y1: 1.25, r: 0.02, color: [180, 190, 200] },                          // 天线
      { t: 'sph', c: [0, 1.3, 0], r: 0.06, color: [235, 70, 50] },
      { t: 'cyl', y0: -0.5, y1: 0.25, r: 0.09, color: [64, 78, 96] },                             // 臂
      { t: 'cyl', y0: -0.5, y1: 0.25, r: 0.09, color: [64, 78, 96] },
      { t: 'sph', c: [0.62, -0.58, 0], r: 0.11, color: [235, 70, 50] },
      { t: 'sph', c: [-0.62, -0.58, 0], r: 0.11, color: [235, 70, 50] },
      { t: 'box', min: [-1.3, -1.25, 0.8], max: [-0.9, -1.05, 1.3], color: [120, 110, 96] },      // 杂物箱
      { t: 'box', min: [-1.3, -1.05, 0.8], max: [-0.9, -0.9, 1.3], color: [96, 88, 76] },
    ],
  },
  castle: {
    ground: -1.3, groundColor: (x, z) => {
      const n = fbm(x * 2.6, 11, z * 2.6, 3);
      return [72 + n * 36, 108 + n * 46, 60 + n * 26];
    },
    sky: (dy) => [150 + 80 * Math.max(0, dy), 185 + 60 * Math.max(0, dy), 225 + 25 * Math.max(0, dy)],
    fog: 0.12,
    objs: [
      { t: 'box', min: [-0.6, -1.3, -0.6], max: [0.6, 0.2, 0.6], color: [196, 188, 170] },        // 主楼
      { t: 'box', min: [-0.75, -1.3, -1.15], max: [0.75, -0.5, 1.15], color: [186, 178, 160] },   // 院墙
      { t: 'box', min: [-1.15, -1.3, -0.18], max: [-0.75, -0.5, 0.18], color: [186, 178, 160] },
      { t: 'box', min: [0.75, -1.3, -0.18], max: [1.15, -0.5, 0.18], color: [186, 178, 160] },
      { t: 'cyl', y0: -1.3, y1: 0.55, r: 0.3, color: [206, 198, 180] },                           // 四塔
      { t: 'cyl', y0: -1.3, y1: 0.55, r: 0.3, color: [206, 198, 180] },
      { t: 'cyl', y0: -1.3, y1: 0.55, r: 0.3, color: [206, 198, 180] },
      { t: 'cyl', y0: -1.3, y1: 0.55, r: 0.3, color: [206, 198, 180] },
      { t: 'cone', y0: 0.55, y1: 1.15, r: 0.38, color: [178, 52, 40] },
      { t: 'cone', y0: 0.55, y1: 1.15, r: 0.38, color: [178, 52, 40] },
      { t: 'cone', y0: 0.55, y1: 1.15, r: 0.38, color: [178, 52, 40] },
      { t: 'cone', y0: 0.55, y1: 1.15, r: 0.38, color: [178, 52, 40] },
      { t: 'cyl', y0: 0.2, y1: 0.85, r: 0.05, color: [110, 90, 60] },                             // 旗杆
      { t: 'box', min: [0.05, 0.62, -0.01], max: [0.34, 0.84, 0.01], color: [232, 170, 50] },      // 旗
      { t: 'box', min: [-0.12, -1.3, 0.6], max: [0.12, -0.9, 0.84], color: [96, 66, 44] },        // 门
      { t: 'sph', c: [0.95, -1.16, 0.95], r: 0.13, sy: 0.7, color: [140, 138, 130] },
    ],
    shift: (o) => { // 四塔位置由偏移实现：复制时平移
      return o;
    },
  },
  forest: {
    ground: -1.3, groundColor: (x, z) => {
      const n = fbm(x * 2.8, 21, z * 2.8, 4);
      return [34 + n * 30, 62 + n * 40, 38 + n * 24];
    },
    sky: (dy) => [190 + 50 * Math.max(0, dy), 205 + 40 * Math.max(0, dy), 215 + 30 * Math.max(0, dy)],
    fog: 0.55, fogColor: [200, 210, 218],
    objs: [
      { t: 'tree', x: 0, z: 0, h: 2.6, r: 0.55 },
      { t: 'tree', x: 1.5, z: 0.7, h: 2.0, r: 0.42 },
      { t: 'tree', x: -1.6, z: 0.9, h: 2.2, r: 0.46 },
      { t: 'tree', x: 0.8, z: -1.7, h: 1.8, r: 0.38 },
      { t: 'tree', x: -1.1, z: -1.8, h: 2.4, r: 0.5 },
      { t: 'tree', x: 2.3, z: -1.0, h: 1.6, r: 0.34 },
      { t: 'tree', x: -2.5, z: -0.6, h: 1.9, r: 0.4 },
      { t: 'tree', x: 1.9, z: 1.9, h: 1.5, r: 0.32 },
      { t: 'tree', x: -2.2, z: 2.0, h: 1.7, r: 0.36 },
    ],
  },
  planet: {
    ground: null, // 无地面
    sky: (dy, dx, dz) => {
      const star = hash3(Math.round(dx * 220), Math.round(dy * 220), Math.round(dz * 220));
      const s = star > 0.9975 ? 1 : 0;
      return [10 + s * 200, 12 + s * 200, 24 + s * 210];
    },
    fog: 0,
    objs: [
      { t: 'sph', c: [0, 0.1, 0], r: 1.05, pattern: (p) => {
        const lat = p[1];
        const band = noise3(lat * 7, 0, 0);
        const swirl = fbm(p[0] * 2.4 + 3, p[1] * 2.4, p[2] * 2.4, 4);
        if (swirl > 0.62) return [236, 240, 244];           // 云带
        const t = band * 0.6 + swirl * 0.4;
        return [30 + t * 40, 90 + t * 90, 150 + t * 70];
      } },
      { t: 'ring', y: 0.1, r0: 1.45, r1: 2.1, pattern: (p) => {
        const r = Math.hypot(p[0], p[2]);
        const n = noise3(r * 9, 0, 0);
        return [200 + n * 40, 180 + n * 50, 140 + n * 60];
      } },
      { t: 'sph', c: [1.9, 0.9, -0.6], r: 0.22, color: [170, 160, 150] },   // 卫星
      { t: 'sph', c: [-1.5, -0.7, 1.2], r: 0.13, color: [200, 190, 180] },
    ],
  },
  teapot: {
    ground: -1.2, groundColor: (x, z) => {
      const n = fbm(x * 3.4, 31, z * 3.4, 3);
      const flower = noise3(x * 5, 0, z * 5) > 0.72;
      return flower ? [235, 120 + n * 60, 150] : [86 + n * 30, 128 + n * 40, 70 + n * 24];
    },
    sky: (dy) => [170 + 70 * Math.max(0, dy), 200 + 45 * Math.max(0, dy), 230 + 20 * Math.max(0, dy)],
    fog: 0.12,
    objs: [
      { t: 'sph', c: [0, -0.72, 0], r: 0.48, sy: 0.94, color: [226, 232, 238] },   // 壶身
      { t: 'cyl', y0: -0.3, y1: -0.18, r: 0.2, color: [210, 218, 226] },           // 壶盖
      { t: 'sph', c: [0, -0.13, 0], r: 0.07, color: [196, 92, 60] },               // 盖钮
      { t: 'cone', y0: -0.75, y1: -0.1, r: 0.1, color: [226, 232, 238] },          // 壶嘴（简化为锥）
      { t: 'sph', c: [-0.52, -0.6, 0], r: 0.1, color: [226, 232, 238] },           // 把手（三段球）
      { t: 'sph', c: [-0.6, -0.42, 0], r: 0.09, color: [226, 232, 238] },
      { t: 'sph', c: [-0.52, -0.26, 0], r: 0.08, color: [226, 232, 238] },
      { t: 'cyl', y0: -1.2, y1: -0.95, r: 0.16, color: [245, 240, 228] },          // 茶杯
      { t: 'cyl', y0: -0.95, y1: -0.93, r: 0.18, color: [232, 226, 210] },
      { t: 'sph', c: [0.75, -1.08, 0.55], r: 0.12, color: [250, 246, 238] },       // 茶碟
      { t: 'sph', c: [-0.9, -1.05, -0.7], r: 0.11, color: [250, 246, 238] },
    ],
  },
};

// 城堡 preset：四塔按方位排布
function buildCastle(preset) {
  const objs = [];
  const towerPos = [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]];
  let ti = 0;
  for (const o of preset.objs) {
    if (o.t === 'cyl' && o.r === 0.3) {
      const [x, z] = towerPos[ti++ % 4];
      objs.push({ ...o, c: [x, z] });
    } else if (o.t === 'cone' && o.r === 0.38) {
      const [x, z] = towerPos[(ti++ - 4) % 4];
      objs.push({ ...o, c: [x, z] });
    } else objs.push(o);
  }
  return objs;
}

// 平移支持：给圆柱/圆锥/盒加 c:[x,z] 偏移
function offsetObj(o) {
  if (o.c && o.t === 'cyl') return { ...o, cx: o.c[0], cz: o.c[1] };
  if (o.c && o.t === 'cone') return { ...o, cx: o.c[0], cz: o.c[1] };
  return o;
}

// ---------- 渲染 ----------
export function renderSample(name, W = 1024, H = 512) {
  const preset = PRESETS[name] || PRESETS.mushroom;
  let objs = preset.objs;
  if (name === 'castle') objs = buildCastle(preset);
  if (name === 'forest') {
    objs = [];
    for (const o of preset.objs) {
      if (o.t === 'tree') {
        objs.push({ t: 'cyl', y0: preset.ground, y1: preset.ground + o.h * 0.35, r: o.r * 0.16, color: [104, 74, 50], cx: o.x, cz: o.z });
        objs.push({ t: 'cone', y0: preset.ground + o.h * 0.22, y1: preset.ground + o.h, r: o.r, color: [42, 96, 56], cx: o.x, cz: o.z });
        objs.push({ t: 'cone', y0: preset.ground + o.h * 0.45, y1: preset.ground + o.h * 1.12, r: o.r * 0.72, color: [52, 112, 64], cx: o.x, cz: o.z });
      }
    }
  }
  objs = objs.map(offsetObj);

  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(W, H);
  const data = img.data;
  const fogC = preset.fogColor || null;
  const fogK = preset.fog ?? 0;

  for (let y = 0; y < H; y++) {
    const lat = (0.5 - (y + 0.5) / H) * Math.PI;
    const cosLat = Math.cos(lat), sinLat = Math.sin(lat);
    for (let x = 0; x < W; x++) {
      const lon = ((x + 0.5) / W) * 2 * Math.PI - Math.PI;
      const d = [cosLat * Math.sin(lon), sinLat, cosLat * Math.cos(lon)];
      let bestT = Infinity, bestObj = null, bestP = null, bestN = null;

      // 地面
      if (preset.ground !== null && d[1] < -1e-6) {
        const t = (preset.ground - 0) / d[1];
        if (t > 0 && t < bestT) {
          bestT = t;
          bestObj = { t: 'ground' };
          bestP = [d[0] * t, preset.ground, d[2] * t];
          bestN = [0, 1, 0];
        }
      }
      for (const o of objs) {
        let t = -1, p = null, nrm = null;
        if (o.t === 'sph') t = hitSphere([0, 0, 0], d, o);
        else if (o.t === 'box') t = hitBox([0, 0, 0], d, o);
        else if (o.t === 'cyl') {
          const oo = o.cx !== undefined ? [o.cx, 0, o.cz] : [0, 0, 0];
          const ld = d, lo = oo;
          // 把圆柱平移到原点系：光线起点相对柱心
          t = hitCylinderLocal(lo, ld, o);
        } else if (o.t === 'cone') {
          const oo = o.cx !== undefined ? [o.cx, 0, o.cz] : [0, 0, 0];
          t = hitConeLocal(oo, d, o);
        } else if (o.t === 'ring') t = hitRing([0, 0, 0], d, o);
        if (t > 0 && t < bestT) {
          bestT = t;
          bestObj = o;
          bestP = [d[0] * t, d[1] * t, d[2] * t];
        }
      }

      let col;
      if (!bestObj) {
        const s = preset.sky(d[1], d[0], d[2]);
        col = s;
      } else if (bestObj.t === 'ground') {
        col = preset.groundColor(bestP[0], bestP[2]);
        const lam = Math.max(0, bestN[1] * SUN[1] + 0.3);
        col = [col[0] * (0.42 + 0.58 * lam), col[1] * (0.42 + 0.58 * lam), col[2] * (0.42 + 0.58 * lam)];
      } else {
        col = bestObj.pattern ? bestObj.pattern(bestP) : bestObj.color;
        // 简易发现法线
        let nrm;
        if (bestObj.t === 'sph') {
          const sy = bestObj.sy || 1;
          nrm = [(bestP[0] - bestObj.c[0]), (bestP[1] - bestObj.c[1]) / sy, (bestP[2] - bestObj.c[2])];
        } else if (bestObj.t === 'box') {
          const c = [(bestObj.min[0] + bestObj.max[0]) / 2, (bestObj.min[1] + bestObj.max[1]) / 2, (bestObj.min[2] + bestObj.max[2]) / 2];
          const e = [bestObj.max[0] - bestObj.min[0], bestObj.max[1] - bestObj.min[1], bestObj.max[2] - bestObj.min[2]];
          const dx = Math.abs(bestP[0] - c[0]) / e[0], dy = Math.abs(bestP[1] - c[1]) / e[1], dz = Math.abs(bestP[2] - c[2]) / e[2];
          nrm = dx > dy && dx > dz ? [Math.sign(bestP[0] - c[0]), 0, 0] : dy > dz ? [0, Math.sign(bestP[1] - c[1]), 0] : [0, 0, Math.sign(bestP[2] - c[2])];
        } else if (bestObj.t === 'cyl' || bestObj.t === 'cone') {
          const cx = bestObj.cx || 0, cz = bestObj.cz || 0;
          if (bestObj.t === 'cyl') nrm = [bestP[0] - cx, 0, bestP[2] - cz];
          else {
            const h = bestObj.y1 - bestObj.y0;
            const rr = bestObj.r * (1 - (bestP[1] - bestObj.y0) / h);
            nrm = [bestP[0] - cx, bestObj.r / h, bestP[2] - cz];
          }
        } else { nrm = [0, 1, 0]; }
        const nl = Math.hypot(...nrm) || 1;
        nrm = nrm.map(v => v / nl);
        const lam = Math.max(0.12, nrm[0] * SUN[0] + nrm[1] * SUN[1] + nrm[2] * SUN[2]);
        col = [col[0] * (0.3 + 0.7 * lam), col[1] * (0.3 + 0.7 * lam), col[2] * (0.3 + 0.7 * lam)];
      }

      // 雾
      if (fogK > 0 && bestT < Infinity) {
        const f = Math.min(1, fogK * bestT / 3);
        const fc = fogC || preset.sky(d[1], d[0], d[2]);
        col = [col[0] * (1 - f) + fc[0] * f, col[1] * (1 - f) + fc[1] * f, col[2] * (1 - f) + fc[2] * f];
      }

      const i = (y * W + x) * 4;
      data[i] = Math.max(0, Math.min(255, col[0]));
      data[i + 1] = Math.max(0, Math.min(255, col[1]));
      data[i + 2] = Math.max(0, Math.min(255, col[2]));
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// 带平移的圆柱/圆锥求交（把光线起点平移到柱心系）
function hitCylinderLocal(o, d, c) {
  const lo = [o[0] - (c.cx || 0), o[1], o[2] - (c.cz || 0)];
  return hitCylinder(lo, d, c);
}
function hitConeLocal(o, d, c) {
  const lo = [o[0] - (c.cx || 0), o[1], o[2] - (c.cz || 0)];
  return hitCone(lo, d, c);
}

export const SAMPLE_NAMES = Object.keys(PRESETS);

// 每个示例场景的推荐参数（grid=体素精度, near=主体深度, cut=背景剔除, base=底座角度）
export const SCENE_PRESETS = {
  mushroom: { grid: 48, near: 0.45, cut: 0.30, base: 52 },
  robot:    { grid: 48, near: 0.50, cut: 0.28, base: 45 },
  castle:   { grid: 48, near: 0.48, cut: 0.32, base: 48 },
  forest:   { grid: 40, near: 0.42, cut: 0.20, base: 55 },
  planet:   { grid: 48, near: 0.55, cut: 0.25, base: 0 },
  teapot:   { grid: 48, near: 0.46, cut: 0.28, base: 50 },
};

// 文字 → 场景关键词匹配（离线"文字造景"）
export function promptToSample(prompt) {
  const map = [
    [/蘑菇|mushroom|菌/i, 'mushroom'],
    [/机器人|robot|机械/i, 'robot'],
    [/城堡|castle|堡垒|宫殿|中世纪/i, 'castle'],
    [/森林|树|雾|wood|forest/i, 'forest'],
    [/星球|宇宙|太空|行星|planet|space/i, 'planet'],
    [/茶|花园|花|tea|garden/i, 'teapot'],
  ];
  for (const [re, name] of map) if (re.test(prompt)) return name;
  return 'mushroom';
}

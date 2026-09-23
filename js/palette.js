// ============================================================
// palette.js — 拼豆色板 + CIELAB/CIEDE2000 感知色差匹配
// ============================================================

// ---------- 色板数据 ----------
// 说明：默认色板采用家族编码（A白灰黑/B红粉/C橙黄/D黄绿/E绿/F青/G蓝/H紫/J棕大地），
// 为可直接使用的示例色板；真实品牌色号（MARD/COCO/Perler/Hama/Artkal）差异较大，
// 工坊内支持导入官方 CSV（code,hex,name）一键替换，解决"色号对不上手里豆子"的痛点。

const ORBIT72 = [
  // A 白·灰·黑
  ['A1','#FFFFFF','纯白'],['A2','#F5EFE0','米白'],['A3','#C9C4BB','浅灰'],['A4','#8F8A80','中灰'],
  ['A5','#55504A','深灰'],['A6','#33302C','炭灰'],['A7','#14110E','纯黑'],['A8','#D8D5CE','银灰'],['A9','#A79E8E','暖灰'],
  // B 红·粉
  ['B1','#E02B20','大红'],['B2','#A8120F','深红'],['B3','#6E1420','酒红'],['B4','#F27059','珊瑚粉'],
  ['B5','#F4A7B9','樱粉'],['B6','#D6336C','玫红'],['B7','#A6185C','紫红'],['B8','#F6C1B0','桃粉'],
  ['B9','#B4635A','豆沙'],['B10','#E0409B','品红'],
  // C 橙·黄
  ['C1','#F26B1D','橙色'],['C2','#C24E0E','深橙'],['C3','#F5A623','杏色'],['C4','#F7D117','蛋黄'],
  ['C5','#FFE01B','明黄'],['C6','#E8A020','金黄'],['C7','#F9E7B2','奶油'],['C8','#B96A25','焦糖'],
  ['C9','#EE5A24','橘红'],['C10','#C99B4A','土黄'],['C11','#D9A441','姜黄'],
  // D 黄绿
  ['D1','#A8C62F','黄绿'],['D2','#6FA32B','草绿'],['D3','#7A7A2E','橄榄'],['D4','#B7D96A','嫩绿'],['D5','#4F6B24','苔绿'],
  // E 绿
  ['E1','#4C9A2A','草绿'],['E2','#1F6B33','深绿'],['E3','#14472A','墨绿'],['E4','#7ED0B8','薄荷'],
  ['E5','#0E9F6E','翠绿'],['E6','#2E6B45','森林绿'],['E7','#8FC93A','青苹果'],['E8','#6B8E6F','灰绿'],['E9','#3E8E5A','葱绿'],
  // F 青·蓝绿
  ['F1','#12A594','青绿'],['F2','#0B6E63','深青'],['F3','#29A8C9','湖蓝'],['F4','#7CC7D9','天青'],
  ['F5','#0E7C86','孔雀蓝'],['F6','#9AD1C8','薄荷蓝'],['F7','#1F5F6B','黛青'],
  // G 蓝
  ['G1','#1D4ED8','宝蓝'],['G2','#17357E','深蓝'],['G3','#4A90D9','天蓝'],['G4','#A8CCE8','浅天蓝'],
  ['G5','#16244D','藏青'],['G6','#2B5FC7','钴蓝'],['G7','#7A9CC6','雾蓝'],['G8','#3B3B8F','靛蓝'],['G9','#C9E0F2','冰蓝'],
  // H 紫
  ['H1','#7C3AED','紫色'],['H2','#4C1D95','深紫'],['H3','#B39DDB','薰衣草'],['H4','#8E5AC8','紫罗兰'],
  ['H5','#C9A8D9','藕荷'],['H6','#6B2D7B','深紫红'],
  // J 棕·大地
  ['J1','#6F4E37','咖啡'],['J2','#4A3226','深棕'],['J3','#C19A6B','驼色'],['J4','#E3D0B3','米色'],
  ['J5','#F2C9A0','肤色'],['J6','#A88F5F','卡其'],
];

const MINI24_CODES = ['A1','A2','A4','A7','B1','B4','B6','C1','C4','C5','D1','D2','E1','E4','E6','F1','F3','G1','G3','G5','H1','H3','J1','J5'];

function makePalette(def, name) {
  const colors = def.map(([code, hex, cname]) => ({ code, hex, name: cname }));
  const labs = colors.map(c => hexToLab(c.hex));
  return { name, colors, labs };
}

// 精简 24 色：从 72 色中均衡抽取
function makeMini24(base) {
  const byCode = new Map(base.colors.map(c => [c.code, c]));
  const colors = MINI24_CODES.map(code => byCode.get(code)).filter(Boolean);
  return { name: '精简 24 色', colors, labs: colors.map(c => hexToLab(c.hex)) };
}

// 常用 48 色（近似）：从 72 色中每隔一个抽取
function makeApprox48(base) {
  const colors = base.colors.filter((_, i) => i % 2 === 0 || i % 3 === 0).slice(0, 48);
  const uniq = [...new Map(colors.map(c => [c.code, c])).values()];
  return { name: '常用 48 色（近似）', colors: uniq, labs: uniq.map(c => hexToLab(c.hex)) };
}

export const PALETTES = {
  orbit72: makePalette(ORBIT72, 'BeadOrbit 全色'),
  mard48: makeApprox48(makePalette(ORBIT72, '')),
  mini24: null, // 依赖 orbit72，下面初始化
};
PALETTES.mini24 = makeMini24(PALETTES.orbit72);

// 从用户 CSV 导入色板：code,hex[,name]
export function parsePaletteCSV(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const colors = [];
  for (const line of lines) {
    if (/^code[,;]/i.test(line)) continue;
    const parts = line.split(/[,;\t]/).map(p => p.trim());
    if (parts.length < 2) continue;
    const [code, hex, name] = parts;
    const m = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m) continue;
    colors.push({ code, hex: '#' + m[1].toLowerCase(), name: name || code });
  }
  if (colors.length < 2) throw new Error('CSV 中未找到有效色号（需要 code,hex 两列）');
  return { name: `导入色板 ${colors.length}色`, colors, labs: colors.map(c => hexToLab(c.hex)) };
}

// ---------- 色彩科学：sRGB → XYZ → CIELAB ----------
function srgbToLinear(v) {
  v /= 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 0, 0];
}

export function rgbToLab(r, g, b) {
  const rl = srgbToLinear(r), gl = srgbToLinear(g), bl = srgbToLinear(b);
  // sRGB (D65) → XYZ，白点归一化
  const x = (0.4124564 * rl + 0.3575761 * gl + 0.1804375 * bl) / 0.95047;
  const y = (0.2126729 * rl + 0.7151522 * gl + 0.0721750 * bl) / 1.00000;
  const z = (0.0193339 * rl + 0.1191920 * gl + 0.9503041 * bl) / 1.08883;
  const f = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  const fx = f(x), fy = f(y), fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function hexToLab(hex) {
  const [r, g, b] = hexToRgb(hex);
  return rgbToLab(r, g, b);
}

// ---------- CIEDE2000 感知色差（Sharma et al. 2005） ----------
const RAD = Math.PI / 180;
export function ciede2000(l1, a1, b1, l2, a2, b2) {
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;
  const Cbar7 = Math.pow(Cbar, 7);
  const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + Math.pow(25, 7))));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  let h1p = Math.atan2(b1, a1p) / RAD; if (h1p < 0) h1p += 360;
  let h2p = Math.atan2(b2, a2p) / RAD; if (h2p < 0) h2p += 360;
  const dLp = l2 - l1;
  const dCp = C2p - C1p;
  let dhp;
  if (C1p * C2p === 0) dhp = 0;
  else {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360; else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * RAD);
  const Lbarp = (l1 + l2) / 2, Cbarp = (C1p + C2p) / 2;
  let hbarp;
  if (C1p * C2p === 0) hbarp = h1p + h2p;
  else {
    hbarp = (h1p + h2p) / 2;
    if (Math.abs(h1p - h2p) > 180) hbarp += (h1p + h2p < 360) ? 180 : -180;
  }
  const T = 1 - 0.17 * Math.cos((hbarp - 30) * RAD) + 0.24 * Math.cos(2 * hbarp * RAD)
    + 0.32 * Math.cos((3 * hbarp + 6) * RAD) - 0.20 * Math.cos((4 * hbarp - 63) * RAD);
  const dtheta = 30 * Math.exp(-Math.pow((hbarp - 275) / 25, 2));
  const Cbarp7 = Math.pow(Cbarp, 7);
  const Rc = 2 * Math.sqrt(Cbarp7 / (Cbarp7 + Math.pow(25, 7)));
  const Sl = 1 + (0.015 * Math.pow(Lbarp - 50, 2)) / Math.sqrt(20 + Math.pow(Lbarp - 50, 2));
  const Sc = 1 + 0.045 * Cbarp;
  const Sh = 1 + 0.015 * Cbarp * T;
  const Rt = -Math.sin(2 * dtheta * RAD) * Rc;
  return Math.sqrt(
    Math.pow(dLp / Sl, 2) + Math.pow(dCp / Sc, 2) + Math.pow(dHp / Sh, 2) +
    Rt * (dCp / Sc) * (dHp / Sh)
  );
}

// ---------- 带 LUT 缓存的最近色匹配器 ----------
const LUT_SIZE = 32;
export class PaletteMatcher {
  constructor(palette) {
    this.palette = palette;
    this.lut = new Int16Array(LUT_SIZE * LUT_SIZE * LUT_SIZE).fill(-1);
    this.stats = { hits: 0, misses: 0 };
  }
  // 输入 0-255 RGB，返回色板索引
  match(r, g, b) {
    const lk = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    let idx = this.lut[lk];
    if (idx >= 0) { this.stats.hits++; return idx; }
    const lab = rgbToLab(r, g, b);
    let best = 0, bestD = Infinity;
    const labs = this.palette.labs;
    for (let i = 0; i < labs.length; i++) {
      const d = ciede2000(lab[0], lab[1], lab[2], labs[i][0], labs[i][1], labs[i][2]);
      if (d < bestD) { bestD = d; best = i; }
    }
    this.lut[lk] = best;
    this.stats.misses++;
    return best;
  }
}

// ---------- 贪心限色：只保留最能代表作品的 N 个色号 ----------
// 输入：Map<paletteIndex, count>；返回：Map<原索引, 保留索引>
export function greedyLimit(counts, palette, maxColors) {
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (entries.length <= maxColors) {
    const m = new Map();
    for (const [i] of entries) m.set(i, i);
    return m;
  }
  const kept = entries.slice(0, maxColors).map(e => e[0]);
  const keptLabs = kept.map(i => palette.labs[i]);
  const remap = new Map();
  for (const [i] of entries) {
    const lab = palette.labs[i];
    let best = 0, bestD = Infinity;
    for (let k = 0; k < keptLabs.length; k++) {
      const d = ciede2000(lab[0], lab[1], lab[2], keptLabs[k][0], keptLabs[k][1], keptLabs[k][2]);
      if (d < bestD) { bestD = d; best = k; }
    }
    remap.set(i, kept[best]);
  }
  return remap;
}

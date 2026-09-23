// ============================================================
// iron.js — 熨烫模拟器（现实工艺参数化）
// 依据 Perler 官方与社区工艺数据：
//   中档干烫 150–170°C，每面 10–20 秒；双面熨；过度熨烫孔闭合装不上
// 温度 × 时间 → 熔合等级 0–3，并给出工艺警示
// ============================================================

export const IRON_LEVELS = [
  { name: '未熨烫', desc: '豆子各自独立，未融合' },
  { name: '轻熨', desc: '边缘初融，孔完全开放——适合需要插 tab 的立体片' },
  { name: '标准熨', desc: '边缘连续融合、孔仍可见——平面作品推荐' },
  { name: '全熔', desc: '孔闭合、表面平整——强度高但立体件装不上，易翘曲' },
];

/**
 * 计算熔合等级与警示
 * @param temp 摄氏度 @param sec 每面秒数 @param sides 1|2 @param steam 是否开蒸汽
 * @returns { level, warnings: string[], tips: string[] }
 */
export function ironResult(temp, sec, sides = 2, steam = false) {
  const warnings = [];
  const tips = [];
  // 熔合量：温度与时间共同决定（基准 160°C / 15s = 标准熨）
  const tF = clamp((temp - 118) / 46, 0, 1.5);
  const sF = clamp(sec / 15, 0, 1.5);
  const fuse = tF * sF * (sides >= 2 ? 1.08 : 1);
  let level = fuse < 0.35 ? 0 : fuse < 0.85 ? 1 : fuse < 1.35 ? 2 : 3;

  if (steam) warnings.push('⚠️ 必须干烫：蒸汽会影响成品并报废熨烫纸');
  if (temp < 128) warnings.push('🧊 温度偏低：揭纸时豆子可能崩开，建议 150–170°C');
  if (temp > 182) warnings.push('🔥 温度过高：颜色发白/黄化、塑料片感，且不可逆');
  if (sec > 26) warnings.push('🔥 停留过久：孔会闭合——立体片的 tab 将插不进 slot');
  if (sec < 7 && temp >= 128) warnings.push('🧊 时间不足：融合不牢，建议每面 10–20 秒');
  if (level === 3) warnings.push('🚫 已全熔：立体作品请用「标准熨」，否则无法组装');
  if (level <= 1 && temp >= 128 && sec >= 7) tips.push('💡 融合偏轻：作品易散，适合需要保持孔开放的互锁结构');

  tips.push('💡 双面熨：正面轻熨保细节，反面稍重保强度');
  tips.push('💡 熨后趁热夹在两片厚纸板间，用覆盖整个图案的重物压至完全冷却');
  tips.push('💡 立体片应逐层单独熨、完全冷却后再堆叠点胶（先摆好再点胶）');
  return { level, warnings, tips };
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

/**
 * 应用熨烫到工程
 * @param project BeadProject @param layerIdx -1 = 全部层 @param level 0-3
 */
export function applyIron(project, layerIdx, level) {
  if (layerIdx < 0) project.iron.fill(level);
  else project.iron[layerIdx] = level;
  project.emit('iron');
}

/** 预计工时（秒/颗，按色数与层数加权） */
export function estimateHours(beadCount, colorCount) {
  const per = 5 + Math.min(6, colorCount * 0.35);
  return (beadCount * per) / 3600;
}

// ============================================================
// platform.js — 拼豆制作平台（编辑器 + 熨烫模拟 + 模板 + AI 桥接）
// 把 2D 拼豆完整工作流（摆豆/图层/色板/限色/BOM/熨烫）搬进 3D 工坊
// ============================================================

import { BeadProject, STANDARD_BOARD, COOL_MS } from './project.js';
import { LayerCanvas } from './editor2d.js';
import { BRAND_PALETTES, BRAND_ORDER } from './brand-palettes.js';
import { PALETTES, PaletteMatcher, hexToRgb } from './palette.js';
import { ironResult, applyIron, estimateHours } from './iron.js';

const $ = (id) => document.getElementById(id);

const state = {
  project: null,
  layerCanvas: null,
  tool: 'brush',
  brand: 'mard-291',
  color: 0,
  editing: false,
};

// ---------- 初始化 ----------
export function initPlatform(viewer, ctx) {
  state.viewer = viewer;
  state.ctx = ctx; // { state, toast, setStep, updateStatsUI, exportPatternPNG, exportBOMCSV, exportModelJSON, exportShareCard }

  // 品牌色板下拉
  const sel = $('selBrand');
  sel.innerHTML = BRAND_ORDER.map(k =>
    `<option value="${k}">${BRAND_PALETTES[k].name}（${BRAND_PALETTES[k].colors.length}色）</option>`
  ).join('');
  sel.value = 'mard-291';
  sel.addEventListener('change', () => {
    state.brand = sel.value;
    $('valBrand').textContent = BRAND_PALETTES[state.brand].name.replace(/（.*）/, '');
  });

  // 创作方式切换
  $('modeTabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.src-tab');
    if (!btn) return;
    const mode = btn.dataset.mode;
    // 从编辑模式切回 AI 造物 = 退出编辑
    if (state.editing && mode === 'ai') { exitEdit(); return; }
    if (state.editing && mode === 'new') { exitEdit(); }
    $('modeTabs').querySelectorAll('.src-tab').forEach(b => b.classList.toggle('active', b === btn));
    $('aiPanel').hidden = mode !== 'ai';
    $('newProjectPanel').hidden = mode !== 'new';
    if (mode === 'new' && !state.editing) $('ironPanel').hidden = true;
  });

  // 创建空白作品
  $('btnCreateProject').addEventListener('click', () => {
    const w = clampInt($('inpW').value, 4, 120, 29);
    const d = clampInt($('inpD').value, 4, 120, 29);
    const h = clampInt($('inpH').value, 1, 80, 8);
    const palette = BRAND_PALETTES[state.brand];
    const p = new BeadProject(w, d, h, palette);
    p.name = $('inpProjName').value.trim() || '我的立体拼豆';
    enterEdit(p);
    state.ctx.toast(`已创建 ${w}×${d}×${h} 空白作品，用左侧工具在钉板上摆豆吧`, 'ok', 4000);
  });

  // 模板
  document.querySelectorAll('[data-tpl]').forEach(btn => {
    btn.addEventListener('click', () => {
      const palette = BRAND_PALETTES[state.brand];
      const p = buildTemplate(btn.dataset.tpl, palette);
      p.name = $('inpProjName').value.trim() || '模板作品';
      enterEdit(p);
      state.ctx.toast('模板已生成，可直接修改或熨烫', 'ok');
    });
  });

  // AI 结果 → 编辑器
  $('btnEditProject').addEventListener('click', () => bridgeFromAI());

  initToolbar();
  initLayerStrip();
  initIronPanel();
}

// ---------- 进入/退出编辑模式 ----------
function enterEdit(project) {
  state.project = project;
  state.editing = true;
  $('aiPanel').hidden = true;
  $('newProjectPanel').hidden = true;
  $('ironPanel').hidden = false;
  $('editorToolbar').hidden = false;
  $('boardWrap').hidden = false;
  $('stageOverlay').style.display = 'none';
  $('stageTools').hidden = false;
  $('stageHud').hidden = false;
  document.querySelector('.stage-wrap').classList.add('editing');
  $('btnEditProject').hidden = true;

  // 2D 钉板画布
  if (!state.layerCanvas) {
    state.layerCanvas = new LayerCanvas($('boardCanvas'), project);
    state.layerCanvas.onEdit = () => { syncAll(); };
  } else {
    state.layerCanvas.project = project;
    state.layerCanvas.resetView();
  }
  // 默认选一个顺眼的颜色（红色系）
  const redIdx = project.palette.colors.findIndex(c => /^#([eE]|[dD])/.test(c.hex) && c.hex.match(/^#(.)\1\1/i) === null && parseInt(c.hex.slice(1, 3), 16) > 150);
  state.color = redIdx >= 0 ? redIdx : 0;
  state.layerCanvas.color = state.color;
  buildPaletteGrid();
  updatePaletteCurrent();

  // 3D：俯视编辑视角 + 同步模型
  state.viewer.setEditView(true, project);
  state.viewer.syncProject(project);
  syncAll();
  state.ctx.toast('已进入编辑器：在钉板上摆豆，3D 实时同步', '', 3000);
}

function exitEdit() {
  state.editing = false;
  state.project = null;
  $('aiPanel').hidden = false;
  $('newProjectPanel').hidden = true;
  $('ironPanel').hidden = true;
  $('editorToolbar').hidden = true;
  $('boardWrap').hidden = true;
  document.querySelector('.stage-wrap').classList.remove('editing');
  state.viewer.setEditView(false, null);
  $('modeTabs').querySelectorAll('.src-tab').forEach(b =>
    b.classList.toggle('active', b.dataset.mode === 'ai'));
}

// ---------- 工具栏 ----------
function initToolbar() {
  document.querySelectorAll('.etool[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.etool[data-tool]').forEach(b => b.classList.toggle('active', b === btn));
      state.tool = btn.dataset.tool;
      if (state.layerCanvas) {
        state.layerCanvas.tool = state.tool;
        $('boardCanvas').style.cursor = state.tool === 'pick' ? 'copy' : 'crosshair';
      }
    });
  });
  const bind = (id, fn) => $(id).addEventListener('click', fn);
  bind('btnMirrorX', () => toggleMirror('x'));
  bind('btnMirrorZ', () => toggleMirror('z'));
  bind('btnRadial', () => {
    const p = state.project;
    if (!p) return;
    p.snapshot();
    p.radial(4);
    syncAll();
    state.ctx.toast('已应用 4 路径向对称', 'ok', 2000);
  });
  bind('btnUndo', () => { state.project?.undo(); syncAll(); });
  bind('btnRedo', () => { state.project?.redo(); syncAll(); });
  $('rngBrush').addEventListener('input', (e) => {
    const r = parseInt(e.target.value);
    if (state.layerCanvas) state.layerCanvas.brush = r;
    $('valBrush').textContent = `${r * 2 + 1}×${r * 2 + 1}`;
  });
  bind('btnCodes', () => {
    if (!state.layerCanvas) return;
    state.layerCanvas.showCodes = !state.layerCanvas.showCodes;
    $('btnCodes').classList.toggle('active', state.layerCanvas.showCodes);
    state.layerCanvas.redraw();
  });
  bind('btnTabs', () => generateTabs());
  bind('btnHollow', () => hollowInterior());
}
// ---------- 互锁 tabs 生成（立体组装工艺） ----------
// 现实工艺：立体片边缘做 1 格凸榫（tab），与另一片的凹槽（slot）互锁，
// 靠摩擦定型，太松再点热熔胶。这里为当前层四边自动生成凸榫。
function generateTabs(interval = 4) {
  const p = state.project;
  if (!p) return;
  const y = p.current;
  const layer = p.layers[y];
  let x0 = 1e9, x1 = -1, z0 = 1e9, z1 = -1;
  for (let z = 0; z < p.d; z++) for (let x = 0; x < p.w; x++) {
    if (layer[z * p.w + x] > 0) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  }
  if (x1 < x0) return state.ctx.toast('当前层是空的，先摆豆', 'err');
  p.snapshot();
  // 扩大 2 格边界以容纳凸榫
  const q = new BeadProject(p.w + 2, p.d + 2, p.h, p.palette);
  q.name = p.name;
  q.current = p.current;
  q.iron.set(p.iron);
  q.cool.set(p.cool);
  for (let yy = 0; yy < p.h; yy++) {
    for (let z = 0; z < p.d; z++) {
      for (let x = 0; x < p.w; x++) {
        q.layers[yy][(z + 1) * q.w + (x + 1)] = p.layers[yy][z * p.w + x];
      }
    }
  }
  const ax0 = x0 + 1, ax1 = x1 + 1, az0 = z0 + 1, az1 = z1 + 1;
  const put = (x, z, sx, sz) => {
    if (!q.inBounds(x, z)) return 0;
    const inner = q.layers[y][(z + sz) * q.w + (x + sx)];
    if (inner > 0 && q.layers[y][z * q.w + x] === 0) { q.layers[y][z * q.w + x] = inner; return 1; }
    return 0;
  };
  let tabs = 0;
  for (let x = ax0; x <= ax1; x += interval) {
    tabs += put(x, az0 - 1, 0, 1);
    tabs += put(x, az1 + 1, 0, -1);
  }
  for (let z = az0; z <= az1; z += interval) {
    tabs += put(ax0 - 1, z, 1, 0);
    tabs += put(ax1 + 1, z, -1, 0);
  }
  // 用新工程替换
  Object.assign(state.project, q);
  state.layerCanvas.project = q;
  state.layerCanvas.resetView();
  state.viewer.buildPegboard(q);
  state.viewer.syncProject(q);
  syncAll();
  state.ctx.toast(`已生成 ${tabs} 个互锁凸榫（每 ${interval} 格一个）—— mating 片对应位置留空作 slot，先摆好后点胶`, 'ok', 5000);
}

// ---------- 内部层空心省豆 ----------
// 现实工艺：轮廓层实心、内部层只留边框，省豆减重（官方 3D 项目同款技巧）
function hollowInterior() {
  const p = state.project;
  if (!p) return;
  let saved = 0;
  p.snapshot();
  for (let y = 1; y < p.h - 1; y++) {
    if (y === p.current) continue;
    const l = p.layers[y];
    const copy = l.slice();
    for (let z = 1; z < p.d - 1; z++) {
      for (let x = 1; x < p.w - 1; x++) {
        const i = z * p.w + x;
        if (copy[i] > 0 && copy[i - 1] > 0 && copy[i + 1] > 0 && copy[i - p.w] > 0 && copy[i + p.w] > 0) {
          l[i] = 0;
          saved++;
        }
      }
    }
  }
  syncAll();
  if (saved > 0) {
    state.ctx.toast(`内部层已空心化，节省 ${saved} 颗豆（悬空豆警示会标出需要补支撑的位置）`, 'ok', 5000);
  } else {
    state.ctx.toast('没有可空心化的内部层', '');
  }
}

function toggleMirror(axis) {
  if (!state.layerCanvas) return;
  state.layerCanvas.mirror[axis] = !state.layerCanvas.mirror[axis];
  $(axis === 'x' ? 'btnMirrorX' : 'btnMirrorZ').classList.toggle('warn-on', state.layerCanvas.mirror[axis]);
  state.layerCanvas.redraw();
}

// ---------- 层面板 ----------
function initLayerStrip() {
  const bind = (id, fn) => $(id).addEventListener('click', fn);
  bind('btnLayerPrev', () => { if (state.project?.moveLayer(-1)) afterLayerChange(); });
  bind('btnLayerNext', () => { if (state.project?.moveLayer(1)) afterLayerChange(); });
  bind('btnAddLayer', () => { if (state.project?.addLayer()) afterLayerChange(); });
  bind('btnDupLayer', () => { if (state.project?.duplicateLayer()) afterLayerChange(); });
  bind('btnDelLayer', () => { if (state.project?.deleteLayer()) afterLayerChange(); });
  bind('btnClearLayer', () => {
    const p = state.project;
    if (!p) return;
    p.snapshot();
    p.clearLayer();
    syncAll();
  });
}
function afterLayerChange() {
  const p = state.project;
  if (!p) return;
  state.viewer.buildPegboard(p);
  state.viewer.syncProject(p);
  syncAll();
}

// ---------- 色板选择器 ----------
function buildPaletteGrid() {
  const grid = $('palGrid');
  const colors = state.project.palette.colors;
  grid.innerHTML = '';
  const frag = document.createDocumentFragment();
  colors.forEach((c, i) => {
    const el = document.createElement('i');
    el.style.background = c.hex;
    el.title = `${c.code} ${c.name}`;
    el.addEventListener('click', () => {
      state.color = i;
      state.layerCanvas.color = i;
      updatePaletteCurrent();
    });
    frag.appendChild(el);
  });
  grid.appendChild(frag);
  updatePaletteCurrent();
}
function updatePaletteCurrent() {
  const c = state.project.palette.colors[state.color];
  if (!c) return;
  $('palCurrentChip').style.background = c.hex;
  $('palCurrentCode').textContent = c.code;
  $('palGrid').querySelectorAll('i').forEach((el, i) => el.classList.toggle('sel', i === state.color));
}

// ---------- 熨烫面板（动画 + 冷却） ----------
let coolTimer = null;
function initIronPanel() {
  const update = () => {
    const temp = parseInt($('rngTemp').value);
    const sec = parseInt($('rngSec').value);
    const sides = parseInt($('selSides').value);
    $('valTemp').textContent = `${temp}°C`;
    $('valSec').textContent = `${sec} 秒`;
    const r = ironResult(temp, sec, sides);
    const lv = ['未熨烫', '轻熨', '标准熨', '全熔'][r.level];
    $('valIronLevel').textContent = lv;
    $('ironLive').innerHTML =
      `<span class="lv">预计熔合：${lv}</span>` +
      r.warnings.map(w => `<span class="w">${w}</span>`).join('') +
      r.tips.slice(0, 2).map(t => `<span class="t">${t}</span>`).join('');
    return r;
  };
  ['rngTemp', 'rngSec', 'selSides'].forEach(id => $(id).addEventListener('input', update));
  update();

  // 熨烫：播放「熨斗+熨烫纸+渐进熔合」动画，结束后才落状态
  const doIron = (all) => {
    const p = state.project;
    if (!p || state.ironing) return;
    const r = update();
    const layers = all ? p.layers.map((l, y) => y).filter(y => p.layers[y].some(v => v > 0)) : [p.current];
    if (!layers.length) return state.ctx.toast('没有可熨烫的层', 'err');
    state.ironing = true;
    const names = ['未熨烫', '轻熨', '标准熨', '全熔'];
    p.snapshot();
    const sides = parseInt($('selSides').value);
    const dur = 900 + layers.length * 1400;
    let i = 0;
    const next = () => {
      if (i >= layers.length) {
        state.ironing = false;
        syncAll();
        state.ctx.toast(`熨烫完成：${names[r.level]}——作品还发烫，冷却 ${COOL_MS / 1000} 秒后才能叠层`, r.level >= 3 ? 'err' : 'ok', 5000);
        return;
      }
      const y = layers[i++];
      state.viewer.startIroning(y, r.level, sides, Math.min(2600, dur / layers.length), () => {
        applyIron(p, y, r.level);
        p.cool[y] = 0;              // 刚熨完：发烫
        startCooling();
        next();
      });
    };
    next();
  };
  $('btnIronLayer').addEventListener('click', () => doIron(false));
  $('btnIronAll').addEventListener('click', () => doIron(true));
  $('btnUniron').addEventListener('click', () => {
    const p = state.project;
    if (!p) return;
    p.snapshot();
    applyIron(p, -1, 0);
    p.cool.fill(1);
    syncAll();
    state.ctx.toast('已重置熨烫状态');
  });
}

// 冷却计时：真实时间流逝，发热层逐渐降温
function startCooling() {
  if (coolTimer) return;
  coolTimer = setInterval(() => {
    const p = state.project;
    if (!p) { stopCooling(); return; }
    if (p.tickCooling(400)) {
      state.viewer.updateHeat(p);
      renderLayerChips();
      updateHotWarning();
    } else {
      stopCooling();
    }
  }, 400);
}
function stopCooling() {
  if (coolTimer) { clearInterval(coolTimer); coolTimer = null; }
}

// ---------- 制作看板（每层工艺状态） ----------
function layerStatus(p, y) {
  const has = p.layers[y].some(v => v > 0);
  if (!has) return { key: 'empty', label: '空', icon: '⬜' };
  if (p.iron[y] >= 3) return { key: 'full', label: '全熔', icon: '⚠️' };
  if (p.iron[y] > 0) {
    return p.cool[y] < 1
      ? { key: 'hot', label: '冷却中', icon: '🔥' }
      : { key: 'done', label: '已熨已冷', icon: '✅' };
  }
  return { key: 'placed', label: '已摆未熨', icon: '🧩' };
}
function renderLayerChips() {
  const p = state.project;
  const wrap = $('layerChips');
  if (!p || !wrap) return;
  wrap.innerHTML = '';
  for (let y = 0; y < p.h; y++) {
    const st = layerStatus(p, y);
    const count = p.layers[y].reduce((s, v) => s + (v > 0 ? 1 : 0), 0);
    const chip = document.createElement('button');
    chip.className = `lchip st-${st.key}${y === p.current ? ' cur' : ''}`;
    chip.innerHTML = `<b>${y + 1}</b><span>${st.icon}</span><i>${count}</i>`;
    chip.title = `第 ${y + 1} 层：${st.label} · ${count} 颗`;
    chip.addEventListener('click', () => {
      p.current = y;
      state.viewer.buildPegboard(p);
      state.viewer.syncProject(p);
      syncAll();
    });
    wrap.appendChild(chip);
  }
}
function updateHotWarning() {
  const p = state.project;
  if (!p) return;
  const warn = $('warnBox');
  const floating = p.floatingBeads();
  const curHas = p.layers[p.current].some(v => v > 0);
  if (p.isHot(p.current) && curHas) {
    // 本层刚熨完：现实里完全冷却前不能叠层、不能揭纸
    const pct = Math.round(p.cool[p.current] * 100);
    warn.hidden = false;
    warn.innerHTML = `🔥 <b>本层刚熨完，冷却中 ${pct}%</b>——现实里完全冷却前不要叠层、不要揭纸（会粘住豆子）。`;
  } else if (p.belowHot()) {
    warn.hidden = false;
    warn.innerHTML = '🔥 <b>下层还在降温</b>——现实里现在叠层会烫坏豆子、导致移位。等它完全冷却（状态变 ✅）再摆下一层。';
  } else if (floating > 0) {
    warn.hidden = false;
    warn.innerHTML = `⚠️ <b>${floating}</b> 颗豆悬空（下方没有支撑）——现实里会掉。<br>请在下一层对应位置补豆，或把本层豆移到有支撑处。`;
  } else if (p.totalBeads() > 0 && p.current > 0) {
    warn.hidden = false;
    warn.innerHTML = '✅ 本层所有豆子都有支撑，结构稳定。';
  } else {
    warn.hidden = true;
  }
}

// ---------- 同步（3D + 统计 + BOM + 警示） ----------
function syncAll() {
  const p = state.project;
  if (!p) return;
  state.viewer.syncProject(p);
  state.layerCanvas.redraw();

  // 统计
  const usage = p.usage();
  const beadCount = p.totalBeads();
  const colorCount = usage.size;
  const bounds = p.bounds();
  const layersUsed = p.layers.filter(l => l.some(v => v > 0)).length;
  const boards = p.boardCount();
  const floating = p.floatingBeads();
  const stats = {
    beadCount, colorCount,
    layerCount: layersUsed,
    sizeText: p.sizeText(p.palette.diameterMm),
    hours: estimateHours(beadCount, colorCount),
    boards: boards.perLayer,
  };
  const beads = [];
  for (let y = 0; y < p.h; y++) {
    const l = p.layers[y];
    for (let z = 0; z < p.d; z++) {
      for (let x = 0; x < p.w; x++) {
        const v = l[z * p.w + x];
        if (v > 0) beads.push({ x, y, z, p: v - 1 });
      }
    }
  }
  state.ctx.state.result = {
    beads, gridN: Math.max(p.w, p.d), palette: p.palette, usage, stats,
    beadMM: p.palette.diameterMm, project: p,
  };

  // UI
  $('statBeads').textContent = beadCount.toLocaleString();
  $('statColors').textContent = colorCount;
  $('statLayers').textContent = layersUsed;
  $('statSize').textContent = stats.sizeText;
  // 重量估算：2.6mm 豆约 0.028g/颗，5mm 约 0.11g/颗
  const perG = p.palette.diameterMm <= 3 ? 0.028 : 0.11;
  const grams = beadCount * perG;
  $('statWeight').textContent = grams < 1000 ? `${grams.toFixed(0)}g` : `${(grams / 1000).toFixed(2)}kg`;
  $('statWeightCard').hidden = false;
  $('layerCur').textContent = p.current + 1;
  $('layerTotal').textContent = p.h;

  // 工艺状态警示（悬空 / 下层未冷）
  updateHotWarning();
  renderLayerChips();
  state.viewer.updateHeat(p);

  // 色板条 + BOM
  const strip = $('paletteStrip');
  strip.innerHTML = '';
  [...usage.entries()].sort((a, b) => b[1] - a[1]).forEach(([idx, count]) => {
    const c = p.palette.colors[idx];
    const i = document.createElement('i');
    i.style.background = c.hex;
    i.title = `${c.code} ${c.name} × ${count}`;
    strip.appendChild(i);
  });
  const bom = $('bomPreview');
  const entries = [...usage.entries()].sort((a, b) => b[1] - a[1]);
  const diff = beadCount < 800 ? '★ 简单' : beadCount < 2500 ? '★★ 适中' : beadCount < 6000 ? '★★★ 挑战' : '★★★★ 大神';
  bom.innerHTML = `<p class="hint" style="margin-bottom:8px">预计工时 <b>${stats.hours < 1 ? Math.round(stats.hours * 60) + ' 分钟' : stats.hours.toFixed(1) + ' 小时'}</b> · 难度 ${diff} · 每层需 <b>${boards.perLayer}</b> 块 29×29 钉板 · ${p.palette.name}</p>`;
  entries.slice(0, 12).forEach(([idx, count]) => {
    const c = p.palette.colors[idx];
    const row = document.createElement('div');
    row.className = 'bom-row';
    row.innerHTML = `<i style="background:${c.hex}"></i><code>${c.code}</code>${c.name}<span class="bom-count">×${count}</span>`;
    bom.appendChild(row);
  });
  if (entries.length > 12) {
    const more = document.createElement('p');
    more.className = 'hint';
    more.style.marginTop = '6px';
    more.textContent = `…共 ${entries.length} 色，导出 CSV 查看完整清单`;
    bom.appendChild(more);
  }

  ['btnExportPng', 'btnExportCsv', 'btnExportJson', 'btnShareCard'].forEach(id => $(id).disabled = false);
  $('hudCount').textContent = `${beadCount} 颗`;
  $('hudBarFill').style.width = '100%';
  $('hudMode').textContent = `编辑模式 · 第 ${p.current + 1} 层`;
}

// ---------- AI 结果 → 工程 ----------
function bridgeFromAI() {
  const r = state.ctx.state.result;
  if (!r || !r.beads?.length) return state.ctx.toast('先让 AI 生成一个作品', 'err');
  const gridN = r.gridN;
  const target = BRAND_PALETTES[state.brand];
  const srcPalette = r.palette;
  // AI 色板 → 品牌色板：按 HEX 用 CIEDE2000 就近映射
  const matcher = new PaletteMatcher(target);
  const colorMap = new Map();
  for (let i = 0; i < srcPalette.colors.length; i++) {
    if (colorMap.has(i)) continue;
    const [rr, gg, bb] = hexToRgb(srcPalette.colors[i].hex);
    colorMap.set(i, matcher.match(rr, gg, bb));
  }
  const p = new BeadProject(gridN, gridN, gridN, target);
  p.name = 'AI 作品精修';
  for (const b of r.beads) {
    if (b.y < p.h && b.x < p.w && b.z < p.d) {
      p.layers[b.y][b.z * p.w + b.x] = colorMap.get(b.p) + 1;
    }
  }
  // 裁剪到实际占用范围，减小编辑面积
  const bounds = p.bounds();
  if (bounds) {
    const w = bounds.x1 - bounds.x0 + 1, d = bounds.z1 - bounds.z0 + 1;
    const h = bounds.y1 - bounds.y0 + 1;
    const q = new BeadProject(w, d, h, target);
    q.name = p.name;
    for (let y = 0; y < h; y++) {
      for (let z = 0; z < d; z++) {
        for (let x = 0; x < w; x++) {
          q.layers[y][z * w + x] = p.layers[bounds.y0 + y][(bounds.z0 + z) * p.w + bounds.x0 + x];
        }
      }
    }
    enterEdit(q);
  } else {
    enterEdit(p);
  }
  state.ctx.toast('已转入编辑器，可逐层精修后导出', 'ok', 4000);
}
// ---------- 模板生成 ----------
function buildTemplate(kind, palette) {
  // 模板颜色按 CIEDE2000 就近匹配到所选色板（精确 hex 不一定存在）
  const matcher = new PaletteMatcher(palette);
  // 注意：调用处传参为 (palette, hex)，第一参数忽略
  const colorIdx = (_palette, hex) => {
    const [r, g, b] = hexToRgb(hex);
    return matcher.match(r, g, b) + 1;
  };
  let p;
  if (kind === 'box') {
    p = new BeadProject(16, 16, 10, palette);
    // 底板实心 + 四壁 + 敞口
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) p.set(x, z, colorIdx(palette, '#C19A6B'), 0);
    for (let y = 1; y < 10; y++) {
      for (let x = 0; x < 16; x++) { p.set(x, 0, colorIdx(palette, '#B96A25'), y); p.set(x, 15, colorIdx(palette, '#B96A25'), y); }
      for (let z = 0; z < 16; z++) { p.set(0, z, colorIdx(palette, '#B96A25'), y); p.set(15, z, colorIdx(palette, '#B96A25'), y); }
    }
  } else if (kind === 'doll') {
    p = new BeadProject(14, 14, 24, palette);
    const skin = colorIdx(palette, '#F2C9A0'), cloth = colorIdx(palette, '#DD4B26'), dark = colorIdx(palette, '#4A3226');
    for (let y = 0; y < 6; y++) for (let x = 4; x < 10; x++) for (let z = 4; z < 10; z++) p.set(x, z, dark, y);       // 腿
    for (let y = 6; y < 14; y++) for (let x = 3; x < 11; x++) for (let z = 3; z < 11; z++) p.set(x, z, cloth, y);      // 身体
    for (let y = 14; y < 16; y++) for (let x = 2; x < 12; x++) for (let z = 5; z < 9; z++) p.set(x, z, cloth, y);      // 手臂
    for (let y = 16; y < 24; y++) {                                                                               // 头（圆形）
      const r = y < 20 ? 4.2 : 3.2;
      for (let x = 0; x < 14; x++) for (let z = 0; z < 14; z++) {
        if (Math.hypot(x - 6.5, z - 6.5) < r) p.set(x, z, skin, y);
      }
    }
  } else if (kind === 'sphere') {
    p = new BeadProject(21, 21, 21, palette);
    const c = colorIdx(palette, '#3F7FBF');
    for (let y = 0; y < 21; y++) for (let x = 0; x < 21; x++) for (let z = 0; z < 21; z++) {
      if (Math.hypot(x - 10, y - 10, z - 10) < 9.6) p.set(x, z, c, y);
    }
  } else { // name：爱心名牌
    p = new BeadProject(29, 29, 2, palette);
    const c = colorIdx(palette, '#D6336C'), bg = colorIdx(palette, '#F5EFE0');
    for (let x = 0; x < 29; x++) for (let z = 0; z < 29; z++) p.set(x, z, bg, 0);
    for (let x = 0; x < 29; x++) for (let z = 0; z < 29; z++) {
      const nx = (x - 14) / 7, nz = (z - 14) / 7;
      const v = Math.pow(nx * nx + nz * nz - 1, 3) - nx * nx * nz * nz * nz;
      if (v < 0) { p.set(x, z, c, 0); p.set(x, z, c, 1); }
    }
  }
  return p;
}
function clampInt(v, min, max, dft) {
  const n = parseInt(v);
  return isNaN(n) ? dft : Math.max(min, Math.min(max, n));
}

// ---------- 对外 ----------
export function isEditing() { return state.editing; }
export function exitEditor() { exitEdit(); }
export function currentProject() { return state.project; }
export { syncAll as syncProject };

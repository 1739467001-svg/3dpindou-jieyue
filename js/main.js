// ============================================================
// main.js — 应用主控：工坊流水线 / UI 联动 / 助手 / 指南
// ============================================================

import { PALETTES, parsePaletteCSV, PaletteMatcher } from './palette.js';
import { estimateDepth, warmup, getEngineName } from './depth.js';
import { unproject, voxelize, quantizeBeads } from './voxel.js';
import { renderSample, promptToSample, SCENE_PRESETS } from './samples.js';
import { BeadViewer, initHeroSphere } from './viewer.js';
import { exportPatternPNG, exportBOMCSV, exportModelJSON, importModelJSON, exportShareCard } from './export.js';
import { initPathSimulator, initChecklist } from './shooting.js';
import { askAssistant, saveSettings, assistantStatus, QUICK_QUESTIONS } from './assistant.js';
import { initPlatform, isEditing, currentProject } from './platform.js';

const $ = (id) => document.getElementById(id);
const WORK_W = 1024;

// ---------- 全局状态 ----------
const state = {
  source: 'image',
  sourceCanvas: null,     // 当前用于建模的图（canvas）
  frames: [],             // 视频关键帧
  customPalette: null,
  result: null,           // { beads, gridN, palette, usage, stats }
  building: false,
};

// ---------- Toast ----------
function toast(msg, type = '') {
  const wrap = $('toastWrap');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .4s, transform .4s';
    el.style.opacity = '0';
    el.style.transform = 'translateY(-10px)';
    setTimeout(() => el.remove(), 420);
  }, 2600);
}

// ---------- Hero：拼豆球 + 跑马灯 ----------
function initHero() {
  const palette = PALETTES.orbit72;
  const hero = initHeroSphere($('heroCanvas'), palette.colors.map(c => c.hex));
  // hero 滚出视口后暂停渲染，省电
  const io = new IntersectionObserver(([en]) => hero.setActive(en.isIntersecting), { threshold: 0.02 });
  io.observe($('hero'));
  const track = $('tickerTrack');
  const words = ['360° 全景', 'AI 深度估计', '体素化', 'CIEDE2000 配色', '逐层拼装', '分层图纸', '材料清单', '影石 X5', '立体拼豆', 'BeadOrbit'];
  const item = (text, hex) => {
    const s = document.createElement('span');
    s.className = 'tick-item';
    s.innerHTML = `<i style="background:${hex}"></i>${text}`;
    return s;
  };
  for (let rep = 0; rep < 2; rep++) {
    for (let i = 0; i < words.length; i++) {
      track.appendChild(item(words[i], palette.colors[(i * 5 + rep) % palette.colors.length].hex));
    }
  }
}

// ---------- 导航 & 滚动显现 ----------
function initNav() {
  const nav = $('siteNav');
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 40);
  }, { passive: true });

  // 手机端汉堡菜单
  const toggle = $('navToggle');
  const navPanel = $('navLinks');
  if (toggle && navPanel) {
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = navPanel.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-label', open ? '关闭菜单' : '打开菜单');
    });
    navPanel.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
      navPanel.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    }));
    document.addEventListener('click', (e) => {
      if (navPanel.classList.contains('open') && !navPanel.contains(e.target) && e.target !== toggle) {
        navPanel.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  const links = document.querySelectorAll('.nav-links a');
  const map = new Map();
  links.forEach(a => {
    const sec = document.querySelector(a.getAttribute('href'));
    if (sec) map.set(sec, a);
  });
  const io = new IntersectionObserver((entries) => {
    entries.forEach(en => {
      if (en.isIntersecting) {
        links.forEach(a => a.style.color = '');
        const a = map.get(en.target);
        if (a) a.style.color = 'var(--coral)';
      }
    });
  }, { rootMargin: '-40% 0px -55% 0px' });
  map.forEach((_, sec) => io.observe(sec));

  const revealIO = new IntersectionObserver((entries) => {
    entries.forEach(en => {
      if (en.isIntersecting) {
        en.target.classList.add('in');
        revealIO.unobserve(en.target);
      }
    });
  }, { threshold: 0.12 });
  document.querySelectorAll('.why-card, .ai-card, .shoot-card, .stat, .arch-node, .rubric-table, .note').forEach(el => {
    el.classList.add('reveal');
    revealIO.observe(el);
  });
}

// ---------- 工坊：素材面板 ----------
function initSourcePanel() {
  const tabs = $('sourceTabs');
  tabs.addEventListener('click', (e) => {
    const btn = e.target.closest('.src-tab');
    if (!btn) return;
    state.source = btn.dataset.src;
    tabs.querySelectorAll('.src-tab').forEach(b => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.src-pane').forEach(p => p.classList.toggle('active', p.dataset.pane === state.source));
  });

  // 图片上传
  const dz = $('dropImage');
  const fi = $('fileImage');
  dz.addEventListener('click', () => fi.click());
  fi.addEventListener('change', () => { if (fi.files[0]) loadImageFile(fi.files[0]); });
  ['dragover', 'dragenter'].forEach(ev => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('dragover'); }));
  ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, () => dz.classList.remove('dragover')));
  dz.addEventListener('drop', (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith('image/')) loadImageFile(f);
  });

  // 视频上传
  const dv = $('dropVideo');
  const fv = $('fileVideo');
  dv.addEventListener('click', () => fv.click());
  fv.addEventListener('change', () => { if (fv.files[0]) loadVideoFile(fv.files[0]); });
  ['dragover', 'dragenter'].forEach(ev => dv.addEventListener(ev, (e) => { e.preventDefault(); dv.classList.add('dragover'); }));
  ['dragleave', 'drop'].forEach(ev => dv.addEventListener(ev, () => dv.classList.remove('dragover')));
  dv.addEventListener('drop', (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith('video/')) loadVideoFile(f);
  });

  // 示例场景
  $('sampleGrid').addEventListener('click', (e) => {
    const btn = e.target.closest('.sample-card');
    if (btn) runSample(btn.dataset.sample);
  });
  $('btnQuickSample').addEventListener('click', () => runSample('mushroom'));

  // 文字生成
  $('btnTextGen').addEventListener('click', () => {
    const prompt = $('textPrompt').value.trim();
    if (!prompt) return toast('先输入一句描述', 'err');
    runSample(promptToSample(prompt), prompt);
  });
  $('promptChips').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    $('textPrompt').value = chip.textContent;
    runSample(promptToSample(chip.textContent), chip.textContent);
  });

  // 帧融合
  $('btnFuseAll').addEventListener('click', () => buildFromFrames());
}

// ---------- 素材装载 ----------
async function loadImageFile(file) {
  try {
    const bmp = await createImageBitmap(file);
    state.sourceCanvas = drawToWork(bmp, WORK_W);
    state.frames = [];
    toast(`已载入全景图 ${bmp.width}×${bmp.height}，点击「开始拼豆」`, 'ok');
  } catch (e) {
    console.error(e);
    toast('图片解码失败', 'err');
  }
}

async function loadVideoFile(file) {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.crossOrigin = 'anonymous';
  toast('正在解析视频并抽取关键帧…');
  try {
    await new Promise((res, rej) => {
      video.onloadedmetadata = res;
      video.onerror = () => rej(new Error('浏览器无法解码该视频'));
    });
    // 流式 webm/部分 mp4 的 duration 可能为 Infinity：seek 到极远处强制解析
    if (!isFinite(video.duration)) {
      await new Promise((res) => {
        video.addEventListener('durationchange', res, { once: true });
        video.currentTime = 1e101;
        setTimeout(res, 2000); // 兜底超时
      });
    }
    const duration = video.duration;
    if (!isFinite(duration) || duration <= 0) throw new Error('视频时长无效');
    const N = 8;
    const frames = [];
    for (let i = 0; i < N; i++) {
      video.currentTime = duration * (i + 0.5) / N;
      await new Promise((res) => video.addEventListener('seeked', res, { once: true }));
      const c = document.createElement('canvas');
      const w = Math.min(1024, video.videoWidth);
      const h = Math.round(w * video.videoHeight / video.videoWidth);
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(video, 0, 0, w, h);
      frames.push(c);
    }
    state.frames = frames;
    renderFrameStrip();
    state.sourceCanvas = frames[Math.floor(N / 2)];
    toast(`已抽取 ${N} 个关键帧，默认选用中间帧`, 'ok');
  } catch (e) {
    console.warn(e);
    toast('视频解码失败：.insv/HEVC 请先用影石 App 或 Studio 导出为 H.264 全景 MP4', 'err', 4200);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function renderFrameStrip() {
  const strip = $('frameStrip');
  const list = $('frameList');
  strip.hidden = false;
  list.innerHTML = '';
  state.frames.forEach((c, i) => {
    const btn = document.createElement('button');
    btn.className = 'frame-thumb' + (c === state.sourceCanvas ? ' active' : '');
    btn.dataset.i = i;
    btn.title = `第 ${i + 1} 帧`;
    const thumb = document.createElement('canvas');
    thumb.width = 256; thumb.height = 128;
    thumb.getContext('2d').drawImage(c, 0, 0, 256, 128);
    btn.appendChild(thumb);
    btn.addEventListener('click', () => {
      state.sourceCanvas = c;
      list.querySelectorAll('.frame-thumb').forEach(b => b.classList.toggle('active', b === btn));
      build();
    });
    list.appendChild(btn);
  });
}

function runSample(name, prompt = '') {
  // 应用该场景的推荐参数
  const preset = SCENE_PRESETS[name];
  if (preset) {
    $('rngGrid').value = preset.grid;  $('valGrid').textContent = `${preset.grid} × ${preset.grid} × ${preset.grid}`;
    $('rngNear').value = preset.near;  $('valNear').textContent = preset.near.toFixed(2);
    $('rngCut').value = preset.cut;    $('valCut').textContent = preset.cut.toFixed(2);
    $('rngBase').value = preset.base;  $('valBase').textContent = `${preset.base}°`;
  }
  setLoading(true, prompt ? `AI 造景中：「${prompt}」…` : '生成 360° 全景场景…');
  setTimeout(() => {
    try {
      const canvas = renderSample(name, WORK_W, WORK_W / 2);
      state.sourceCanvas = canvas;
      state.frames = [];
      setLoading(false);
      const label = prompt ? `「${prompt}」` : SAMPLE_LABELS[name];
      toast(`已生成全景：${label}，开始拼豆`, 'ok');
      build();
    } catch (e) {
      console.error(e);
      setLoading(false);
      toast('场景生成失败', 'err');
    }
  }, 30);
}

const SAMPLE_LABELS = {
  mushroom: '蘑菇小屋', robot: '巡逻机器人', castle: '小城堡',
  forest: '晨雾森林', planet: '环形星球', teapot: '茶壶花园',
};

// 统一缩放到工作分辨率（宽 ≤1024，高 ≤768）
function drawToWork(source, targetW) {
  const sw = source.width || source.videoWidth;
  const sh = source.height || source.videoHeight;
  const w = Math.min(targetW, sw);
  const h = Math.max(128, Math.min(768, Math.round(w * sh / sw)));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d', { willReadFrequently: true }).drawImage(source, 0, 0, w, h);
  return c;
}

// ---------- 参数面板 ----------
function initParams() {
  const bind = (id, valId, fmt) => {
    const el = $(id);
    const update = () => { $(valId).textContent = fmt(parseFloat(el.value)); };
    el.addEventListener('input', update);
    update();
  };
  bind('rngGrid', 'valGrid', v => `${v} × ${v} × ${v}`);
  bind('rngNear', 'valNear', v => v.toFixed(2));
  bind('rngCut', 'valCut', v => v.toFixed(2));
  bind('rngBase', 'valBase', v => `${v}°`);
  $('selPalette').addEventListener('change', () => {
    const sel = $('selPalette');
    const name = sel.value === 'custom' ? (state.customPalette?.name || '导入色板') : sel.options[sel.selectedIndex].text;
    $('valPalette').textContent = name;
  });

  // 导入官方色板 CSV
  $('btnImportPalette').addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.txt';
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const palette = parsePaletteCSV(text);
        state.customPalette = palette;
        const sel = $('selPalette');
        let opt = sel.querySelector('option[value="custom"]');
        if (!opt) {
          opt = document.createElement('option');
          opt.value = 'custom';
          sel.appendChild(opt);
        }
        opt.textContent = palette.name;
        sel.value = 'custom';
        $('valPalette').textContent = palette.name;
        toast(`已导入 ${palette.colors.length} 色官方色板`, 'ok');
      } catch (e) {
        toast(`色板导入失败：${e.message}`, 'err', 4000);
      }
    };
    input.click();
  });
}

function currentPalette() {
  const v = $('selPalette').value;
  if (v === 'custom' && state.customPalette) return state.customPalette;
  return PALETTES[v] || PALETTES.orbit72;
}

// ---------- AI 自动调参 ----------
// 分析深度直方图：在 0.18~0.55 区间找主体与背景之间的「谷底」作为背景剔除阈值，
// 用主体深度的 P90 反推主体半径。基于 AI 深度图本身的统计，不是拍脑袋。
async function autoTune() {
  if (!state.sourceCanvas) {
    toast('请先选择素材', 'err');
    return;
  }
  state.building = true;
  setLoading(true, 'AI 正在分析深度分布，自动推荐参数…');
  try {
    const canvas = state.sourceCanvas;
    const { depth } = await estimateDepth(canvas, canvas.width, canvas.height);
    // 直方图（20 档）
    const BINS = 20;
    const hist = new Array(BINS).fill(0);
    for (let i = 0; i < depth.length; i++) hist[Math.min(BINS - 1, Math.floor(depth[i] * BINS))]++;
    const total = depth.length;
    // 谷底：在 [0.18, 0.55] 找计数最少的档位（主体与背景的分界）
    let cutBin = Math.floor(0.30 * BINS), minCount = Infinity;
    for (let b = Math.floor(0.18 * BINS); b <= Math.floor(0.55 * BINS); b++) {
      if (hist[b] < minCount) { minCount = hist[b]; cutBin = b; }
    }
    const bgCut = Math.round(((cutBin + 0.5) / BINS) * 100) / 100;
    // 主体深度统计（只统计高于阈值的像素）
    const nearPx = [];
    for (let i = 0; i < depth.length; i++) if (depth[i] > bgCut) nearPx.push(depth[i]);
    nearPx.sort((a, b) => a - b);
    // near 决定主体的「起伏量」：取阈值上方一点的中位数，
    // 保证半径区间 [near, 1] 有足够跨度保留三维结构（过大会把主体压扁）
    const p50 = nearPx.length ? nearPx[Math.floor(nearPx.length * 0.5)] : 0.8;
    const nearVal = Math.round(Math.min(0.55, Math.max(0.25, bgCut + 0.12 + p50 * 0.15)) * 100) / 100;

    // 写回 UI
    const setRange = (id, valId, val, fmt) => {
      $(id).value = val;
      $(valId).textContent = fmt(val);
    };
    setRange('rngCut', 'valCut', bgCut, v => v.toFixed(2));
    setRange('rngNear', 'valNear', nearVal, v => v.toFixed(2));
    setLoading(true, `已推荐参数：背景剔除 ${bgCut.toFixed(2)} · 主体深度 ${nearVal.toFixed(2)}，开始拼豆…`);
    await sleep(600);
    state.building = false;   // 让 build() 可以执行
    await build();
    toast(`AI 自动调参完成：剔除 ${bgCut.toFixed(2)} / 深度 ${nearVal.toFixed(2)}`, 'ok');
  } catch (e) {
    console.error(e);
    toast(`自动调参失败：${e.message}`, 'err', 4000);
  } finally {
    setLoading(false);
    state.building = false;
  }
}

// ---------- 流水线 UI ----------
function setStep(n, status, meta = '') {
  const el = document.querySelector(`.pipe-step[data-step="${n}"]`);
  if (!el) return;
  el.classList.remove('running', 'done');
  if (status) el.classList.add(status);
  el.querySelector('.pipe-meta').textContent = meta;
}

function setLoading(on, text = '') {
  $('stageLoading').hidden = !on;
  if (on && text) $('loadingText').textContent = text;
}

// ---------- 核心：构建拼豆 ----------
async function build() {
  if (state.building) return;
  if (!state.sourceCanvas) {
    toast('请先选择素材：上传全景图 / 视频，或试试示例场景', 'err', 3600);
    return;
  }
  state.building = true;
  const t0 = performance.now();
  try {
    const gridN = parseInt($('rngGrid').value);
    const near = parseFloat($('rngNear').value);
    const bgCut = parseFloat($('rngCut').value);
    const baseKeep = parseFloat($('rngBase').value);

    // STEP 1
    setStep(1, 'done', '已就绪');
    // STEP 2 — AI 深度
    setLoading(true, 'AI 正在估计深度…');
    const canvas = state.sourceCanvas;
    const w = canvas.width, h = canvas.height;
    const imgData = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
    const { depth, engine, ms } = await estimateDepth(canvas, w, h);
    setStep(2, 'done', `${engine} ${(ms / 1000).toFixed(1)}s`);
    setLoading(true, '球面反投影 → 点云…');
    await sleep(16);

    // STEP 3 — 反投影
    const pts = unproject(imgData, depth, w, h, {
      near, far: 1.0, bgCut, groundKeep: baseKeep, stride: 2,
    });
    setStep(3, 'done', `${(pts.n / 1000).toFixed(1)}k 点`);
    setLoading(true, '体素化与降噪…');
    await sleep(16);

    // STEP 4 — 体素化
    const { beads: rawBeads } = voxelize(pts, gridN);
    setStep(4, 'done', `${rawBeads.length} 豆`);
    if (rawBeads.length < 40) {
      throw new Error('有效豆子太少——请调低「背景剔除」或调大「底座保留」');
    }
    setLoading(true, '匹配拼豆色板…');
    await sleep(16);

    // STEP 5 — 色板量化
    const palette = currentPalette();
    const matcher = new PaletteMatcher(palette);
    const { beads, usage } = quantizeBeads(rawBeads, matcher);
    if (beads.length > 50000) {
      toast(`豆子较多（${beads.length.toLocaleString()} 颗），低配设备可能卡顿——可调低「体素精度」`, '', 5000);
    }
    // 建造顺序：先按层（y），再按行（z），再按列（x）
    beads.sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);

    // 统计
    let maxX = 0, maxY = 0, maxZ = 0;
    for (const b of beads) {
      if (b.x > maxX) maxX = b.x;
      if (b.y > maxY) maxY = b.y;
      if (b.z > maxZ) maxZ = b.z;
    }
    const beadMM = parseFloat($('selBead').value);
    const stats = {
      beadCount: beads.length,
      colorCount: usage.size,
      layerCount: maxY + 1,
      width: (maxX + 1) * beadMM / 10,
      height: (maxY + 1) * beadMM / 10,
      depth: (maxZ + 1) * beadMM / 10,
      sizeText: `${((maxX + 1) * beadMM / 10).toFixed(1)}×${((maxY + 1) * beadMM / 10).toFixed(1)}×${((maxZ + 1) * beadMM / 10).toFixed(1)}cm`,
      hours: (beads.length * 6 / 3600),
      boards: Math.ceil((maxX + 1) / 29) * Math.ceil((maxZ + 1) / 29),
    };

    state.result = { beads, gridN, palette, usage, stats, beadMM };

    // 渲染
    if (!state.viewer) state.viewer = attachViewer(new BeadViewer($('stageCanvas'), $('stage')));
    state.viewer.setModel(beads, gridN, palette.colors.map(c => c.hex));
    state.viewer.setMode('layer');
    $('btnEditProject').hidden = false;   // AI 结果可转入编辑器精修
    setStep(5, 'done', `${usage.size} 色`);
    setTimeout(() => state.viewer?.startAutoBuild(), 350);

    updateStatsUI();
    $('stageOverlay').style.display = 'none';
    $('stageTools').hidden = false;
    $('stageHud').hidden = false;
    // 手机端：拼豆完成后自动把 3D 舞台滚到视野中央（否则模型在首屏下方）
    if (window.matchMedia('(max-width: 900px)').matches) {
      setTimeout(() => $('stage').scrollIntoView({ behavior: 'smooth', block: 'center' }), 250);
    }
    const dt = ((performance.now() - t0) / 1000).toFixed(1);
    toast(`拼豆完成！${stats.beadCount} 颗豆 / ${stats.layerCount} 层，总耗时 ${dt}s`, 'ok', 3600);
  } catch (e) {
    console.error(e);
    toast(e.message || '生成失败', 'err', 4200);
    setStep(2, '', '');
    setStep(3, '', '');
    setStep(4, '', '');
    setStep(5, '', '');
  } finally {
    setLoading(false);
    state.building = false;
  }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 多帧融合：逐帧深度 → 拼接点云 → 单次体素化
async function buildFromFrames() {
  if (state.building) return;
  if (state.frames.length < 2) return toast('请先上传 360 视频', 'err');
  state.building = true;
  try {
    setLoading(true, `融合 ${state.frames.length} 帧（每帧一次 AI 深度）…`);
    const gridN = parseInt($('rngGrid').value);
    const near = parseFloat($('rngNear').value);
    const bgCut = parseFloat($('rngCut').value);
    const baseKeep = parseFloat($('rngBase').value);
    const picks = [0, 2, 4, 6].filter(i => i < state.frames.length);
    const allPos = [], allCol = [];
    let total = 0;
    for (const i of picks) {
      const c = state.frames[i];
      const w = c.width, h = c.height;
      const imgData = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
      const { depth } = await estimateDepth(c, w, h);
      const pts = unproject(imgData, depth, w, h, { near, far: 1.0, bgCut, groundKeep: baseKeep, stride: 3 });
      allPos.push(pts.pos); allCol.push(pts.col);
      total += pts.n;
    }
    const pos = new Float32Array(total * 3), col = new Float32Array(total * 3);
    let off = 0;
    for (let i = 0; i < allPos.length; i++) {
      pos.set(allPos[i], off * 3); col.set(allCol[i], off * 3);
      off += allPos[i].length / 3;
    }
    setLoading(true, '体素化融合点云…');
    const { beads: rawBeads } = voxelize({ pos, col, n: total }, gridN);
    const palette = currentPalette();
    const matcher = new PaletteMatcher(palette);
    const { beads, usage } = quantizeBeads(rawBeads, matcher);
    beads.sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);
    let maxX = 0, maxY = 0, maxZ = 0;
    for (const b of beads) { maxX = Math.max(maxX, b.x); maxY = Math.max(maxY, b.y); maxZ = Math.max(maxZ, b.z); }
    const beadMM = parseFloat($('selBead').value);
    const stats = {
      beadCount: beads.length, colorCount: usage.size, layerCount: maxY + 1,
      sizeText: `${((maxX + 1) * beadMM / 10).toFixed(1)}×${((maxY + 1) * beadMM / 10).toFixed(1)}×${((maxZ + 1) * beadMM / 10).toFixed(1)}cm`,
      hours: beads.length * 6 / 3600,
      boards: Math.ceil((maxX + 1) / 29) * Math.ceil((maxZ + 1) / 29),
    };
    state.result = { beads, gridN, palette, usage, stats, beadMM };
    if (!state.viewer) state.viewer = attachViewer(new BeadViewer($('stageCanvas'), $('stage')));
    state.viewer.setModel(beads, gridN, palette.colors.map(c => c.hex));
    state.viewer.setMode('layer');
    $('btnEditProject').hidden = false;
    setStep(1, 'done', '多帧融合'); setStep(2, 'done', `${picks.length} 帧`);
    setStep(3, 'done', `${(total / 1000).toFixed(1)}k 点`); setStep(4, 'done', `${rawBeads.length} 豆`);
    setStep(5, 'done', `${usage.size} 色`);
    setTimeout(() => state.viewer?.startAutoBuild(), 350);
    updateStatsUI();
    $('stageOverlay').style.display = 'none';
    $('stageTools').hidden = false;
    $('stageHud').hidden = false;
    toast(`多帧融合完成：${stats.beadCount} 颗豆`, 'ok');
  } catch (e) {
    console.error(e);
    toast(`融合失败：${e.message}`, 'err', 4200);
  } finally {
    setLoading(false);
    state.building = false;
  }
}

// ---------- 统计 / BOM UI ----------
function updateStatsUI() {
  const r = state.result;
  if (!r) return;
  const { stats, palette, usage } = r;
  $('statBeads').textContent = stats.beadCount.toLocaleString();
  $('statColors').textContent = stats.colorCount;
  $('statLayers').textContent = stats.layerCount;
  $('statSize').textContent = stats.sizeText;

  // 色板条
  const strip = $('paletteStrip');
  strip.innerHTML = '';
  [...usage.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([idx, count]) => {
      const c = palette.colors[idx];
      const i = document.createElement('i');
      i.style.background = c.hex;
      i.title = `${c.code} ${c.name} × ${count}`;
      strip.appendChild(i);
    });

  // BOM 预览
  const bom = $('bomPreview');
  const entries = [...usage.entries()].sort((a, b) => b[1] - a[1]);
  const diff = stats.beadCount < 800 ? '★ 简单' : stats.beadCount < 2500 ? '★★ 适中' : stats.beadCount < 6000 ? '★★★ 挑战' : '★★★★ 大神';
  bom.innerHTML = `<p class="hint" style="margin-bottom:8px">
    预计工时 <b>${stats.hours < 1 ? Math.round(stats.hours * 60) + ' 分钟' : stats.hours.toFixed(1) + ' 小时'}</b> ·
    难度 ${diff} · 每层需钉板 ${stats.boards} 个</p>`;
  entries.slice(0, 12).forEach(([idx, count]) => {
    const c = palette.colors[idx];
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
}

// ---------- 舞台工具 ----------
function initStageTools() {
  const viewer = () => state.viewer;
  document.querySelectorAll('.tool[data-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tool[data-mode]').forEach(b => b.classList.toggle('active', b === btn));
      const mode = btn.dataset.mode;
      const v = viewer();
      if (!v) return;
      v.setMode(mode);
      $('hudMode').textContent = { orbit: '观察模式', layer: '逐层建造', bead: '逐颗拼装' }[mode];
      if (mode === 'layer') v.startAutoBuild();
      if (mode === 'bead') {
        toast('逐颗模式：点击画面或按空格，把发光的那颗豆拼上去', '', 3000);
      }
    });
  });

  $('btnSpin').addEventListener('click', () => {
    const v = viewer();
    if (!v) return;
    v.setAutoSpin(!v.controls.autoRotate);
    $('btnSpin').classList.toggle('active', v.controls.autoRotate);
  });
  $('btnSound').addEventListener('click', () => {
    const v = viewer();
    if (!v) return;
    v.soundOn = !v.soundOn;
    $('btnSound').classList.toggle('active', v.soundOn);
    $('btnSound').textContent = v.soundOn ? '🔈 音效' : '🔇 静音';
  });
  $('btnReset').addEventListener('click', () => {
    const v = viewer();
    if (!v) return;
    if (v.editView && window.__platform?.currentProject()) {
      v.setEditView(true, window.__platform.currentProject());  // 编辑模式：回到俯视
    } else {
      v.resetView();
    }
  });

  // 舞台点击 = 放一颗豆（逐颗模式；拖拽旋转后松手不触发）
  let downPos = null;
  const stageCanvas = $('stageCanvas');
  stageCanvas.addEventListener('pointerdown', (e) => { downPos = [e.clientX, e.clientY]; });
  stageCanvas.addEventListener('pointerup', (e) => {
    if (!downPos) return;
    const moved = Math.hypot(e.clientX - downPos[0], e.clientY - downPos[1]);
    downPos = null;
    if (moved > 6) return; // 视为拖拽旋转
    const v = viewer();
    if (v && v.mode === 'bead') v.placeNext();
  });
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const v = viewer();
    if (!v) return;
    // 1/2/3 切换模式
    const modeMap = { Digit1: 'orbit', Digit2: 'layer', Digit3: 'bead' };
    if (modeMap[e.code]) {
      const btn = document.querySelector(`.tool[data-mode="${modeMap[e.code]}"]`);
      btn?.click();
      e.preventDefault();
      return;
    }
    if (e.code === 'KeyR') { v.resetView(); e.preventDefault(); }
    if (e.code === 'KeyS') { $('btnSpin').click(); e.preventDefault(); }
    if (e.code === 'Space' && v.mode === 'bead') { e.preventDefault(); v.placeNext(); }
  });

  // HUD
  $('layerSlider').addEventListener('input', (e) => {
    const v = viewer();
    if (!v || v.mode === 'orbit') return;
    v.stopAutoBuild();
    v.setProgress(parseFloat(e.target.value) / 100);
  });

  $('btnBuild').addEventListener('click', build);
  $('btnAutoTune').addEventListener('click', autoTune);

  // 分享卡片
  $('btnShareCard').addEventListener('click', () => {
    const r = state.result;
    const v = state.viewer;
    if (!r || !v) return toast('先拼一个作品', 'err');
    v.setAutoSpin(false);
    $('btnSpin').classList.remove('active');
    // 无论建造动画进行到哪，卡片里都放完整模型
    const wasPlaced = v.placed;
    v.placed = v.total;
    v._applyCount();
    v.resetView();
    const shot = v.captureImage();
    v.placed = wasPlaced;
    v._applyCount();
    exportShareCard(shot, r.stats, r.palette, r.usage);
    toast('分享卡片已生成，去晒图吧！', 'ok');
  });
}

// HUD 更新（viewer 创建后挂载）
function hudUpdate(placed, total) {
  $('hudCount').textContent = `${placed} / ${total} 颗`;
  $('hudBarFill').style.width = total ? `${(placed / total) * 100}%` : '0%';
  const slider = $('layerSlider');
  const v = state.viewer;
  if (document.activeElement !== slider && v && v.mode !== 'bead') {
    slider.value = total ? (placed / total) * 100 : 0;
  }
  if (v && placed > 0 && placed <= v.beads.length) {
    const layer = v.beads[placed - 1].y + 1;
    const modeName = { orbit: '观察模式', layer: '逐层建造', bead: '逐颗拼装' }[v.mode];
    $('hudMode').textContent = `${modeName} · 第 ${layer} 层`;
  }
}

function attachViewer(v) {
  v.onProgress = hudUpdate;
  v.onComplete = () => {
    if (v.mode !== 'orbit') toast('🎉 拼装完成！可以 360° 欣赏你的作品了', 'ok', 3600);
  };
  return v;
}

// ---------- 导出 ----------
function initExports() {
  $('btnExportPng').addEventListener('click', () => {
    const r = state.result;
    if (!r) return;
    exportPatternPNG(r.beads, r.gridN, r.palette, r.stats);
    toast('分层图纸已导出（带色号，可直接打印）', 'ok');
  });
  $('btnExportCsv').addEventListener('click', () => {
    const r = state.result;
    if (!r) return;
    exportBOMCSV(r.usage, r.palette, r.stats);
    toast('材料清单 CSV 已导出', 'ok');
  });
  $('btnExportJson').addEventListener('click', () => {
    const r = state.result;
    if (!r) return;
    exportModelJSON({
      version: 1,
      palette: { name: r.palette.name, colors: r.palette.colors },
      gridN: r.gridN,
      beadMM: r.beadMM,
      stats: r.stats,
      beads: r.beads,
    });
    toast('作品文件已导出', 'ok');
  });

  // 载入作品 JSON
  $('btnImportJson').addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      try {
        const model = await importModelJSON(file);
        const palette = {
          name: model.palette.name || '导入作品色板',
          colors: model.palette.colors,
        };
        const beads = model.beads.map(b => ({ x: b.x, y: b.y, z: b.z, p: b.p }));
        beads.sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);
        const usage = new Map();
        for (const b of beads) usage.set(b.p, (usage.get(b.p) || 0) + 1);
        state.result = {
          beads,
          gridN: model.gridN,
          palette,
          usage,
          stats: model.stats,
          beadMM: model.beadMM || 2.6,
        };
        if (!state.viewer) state.viewer = attachViewer(new BeadViewer($('stageCanvas'), $('stage')));
        state.viewer.setModel(beads, model.gridN, palette.colors.map(c => c.hex));
        state.viewer.setMode('layer');
        setTimeout(() => state.viewer?.startAutoBuild(), 350);
        updateStatsUI();
        for (let i = 1; i <= 5; i++) setStep(i, 'done', i === 1 ? '作品文件' : '');
        $('stageOverlay').style.display = 'none';
        $('stageTools').hidden = false;
        $('stageHud').hidden = false;
        toast(`已载入作品：${model.stats?.beadCount || beads.length} 颗豆`, 'ok');
      } catch (e) {
        toast(`作品载入失败：${e.message}`, 'err', 4000);
      }
    };
    input.click();
  });
}

// ---------- AI 助手 ----------
function initAssistant() {
  const panel = $('assistantPanel');
  const body = $('assistantBody');
  const chips = $('assistantChips');

  const addMsg = (text, who) => {
    const el = document.createElement('div');
    el.className = `msg ${who}`;
    el.textContent = text;
    body.appendChild(el);
    body.scrollTop = body.scrollHeight;
    return el;
  };

  const open = () => {
    panel.hidden = false;
    if (!body.children.length) {
      addMsg('你好，我是拼豆助手 🧶\n关于拼豆技巧、360 拍摄参数、图纸拼装、产品用法，随便问。', 'bot');
    }
    $('assistantMode').textContent = assistantStatus();
    setTimeout(() => $('assistantText').focus(), 50);
  };
  $('fabAssistant').addEventListener('click', () => panel.hidden ? open() : (panel.hidden = true));
  $('btnAssistantClose').addEventListener('click', () => { panel.hidden = true; });

  QUICK_QUESTIONS.forEach(q => {
    const c = document.createElement('button');
    c.className = 'chip';
    c.textContent = q;
    c.addEventListener('click', () => send(q));
    chips.appendChild(c);
  });

  const send = async (q) => {
    addMsg(q, 'user');
    const typing = addMsg('思考中…', 'bot typing');
    const answer = await askAssistant(q);
    typing.remove();
    addMsg(answer, 'bot');
    $('assistantMode').textContent = assistantStatus();
  };

  $('assistantForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('assistantText');
    const q = input.value.trim();
    if (!q) return;
    input.value = '';
    send(q);
  });

  // 设置
  const modal = $('settingsModal');
  const loadSettings = () => {
    try {
      const s = JSON.parse(localStorage.getItem('beadorbit_assistant') || '{}');
      $('inputApiKey').value = s.apiKey || '';
      $('inputApiBase').value = s.apiBase || '';
      $('inputApiModel').value = s.apiModel || '';
    } catch { /* ignore */ }
  };
  $('btnAssistantSettings').addEventListener('click', () => { loadSettings(); modal.hidden = false; });
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.hidden = true; });
  $('btnSaveSettings').addEventListener('click', () => {
    saveSettings({
      apiKey: $('inputApiKey').value.trim(),
      apiBase: $('inputApiBase').value.trim(),
      apiModel: $('inputApiModel').value.trim(),
    });
    modal.hidden = true;
    $('assistantMode').textContent = assistantStatus();
    toast($('inputApiKey').value.trim() ? '已切换千问大模型模式' : '已切换离线知识库模式', 'ok');
  });
  $('btnClearKey').addEventListener('click', () => {
    saveSettings({});
    loadSettings();
    $('assistantMode').textContent = assistantStatus();
    toast('已清除 Key，回到离线知识库');
  });
}

// ---------- 首次访问引导 ----------
function initFirstVisitGuide() {
  if (localStorage.getItem('beadorbit_visited')) return;
  const badge = document.createElement('div');
  badge.className = 'first-visit';
  badge.innerHTML = '👋 第一次来？<b>点一个示例场景</b>，7 秒看到 360° 立体拼豆';
  document.querySelector('.panel-source').appendChild(badge);
  const dismiss = () => {
    badge.remove();
    localStorage.setItem('beadorbit_visited', '1');
  };
  badge.addEventListener('click', dismiss);
  setTimeout(dismiss, 15000);
}

// ---------- 启动 ----------
window.addEventListener('DOMContentLoaded', () => {
  initHero();
  initNav();
  initSourcePanel();
  initParams();
  initStageTools();
  initExports();
  initFirstVisitGuide();
  // 提前创建 3D 查看器并初始化制作平台（编辑器）
  if (!state.viewer) state.viewer = attachViewer(new BeadViewer($('stageCanvas'), $('stage')));
  initPlatform(state.viewer, {
    state,
    toast,
    setStep,
    updateStatsUI,
    exportPatternPNG,
    exportBOMCSV,
    exportModelJSON,
    exportShareCard,
  });
  initAssistant();
  initPathSimulator($('pathCanvas'), $('pathHint'), $('pathBtns'));
  initChecklist($('checkList'), $('checkFill'), $('checkScore'));

  // 预加载 AI 模型（不阻塞首屏；在流水线第 2 步展示真实下载进度）
  setTimeout(() => {
    const step2 = document.querySelector('.pipe-step[data-step="2"]');
    warmup(
      (msg) => { if (step2) step2.querySelector('.pipe-meta').textContent = '加载中…'; },
      (p) => {
        if (step2 && !step2.classList.contains('done')) {
          step2.querySelector('.pipe-meta').textContent = `加载模型 ${Math.round(p * 100)}%`;
        }
      }
    ).then((ok) => {
      if (step2 && !step2.classList.contains('done')) {
        step2.querySelector('.pipe-meta').textContent = ok ? '就绪' : '离线兜底';
      }
    });
  }, 800);

  // 调试钩子：便于开发期分阶段诊断流水线
  window.__beadorbit = { state, renderSample, estimateDepth, unproject, voxelize, PALETTES, build };
  window.__platform = { currentProject, isEditing };

  // 控制台彩蛋
  console.log('%c BeadOrbit %c 360°立体拼豆工坊 ', 'background:#211b14;color:#f6f0e3;padding:3px 8px;border-radius:6px 0 0 6px', 'background:#dd4b26;color:#fff;padding:3px 8px;border-radius:0 6px 6px 0');
});

// ============================================================
// depth.js — 浏览器端 AI 全景深度估计
// Depth Anything V2 (int8 ONNX) · ONNX Runtime Web
// WebGPU 优先，WASM 兜底；模型加载失败时切换到启发式引擎
// 流程与影石研究院 DAP（ERP → depth → point cloud）同构
// ============================================================

let ortP = null;          // ORT 模块 promise
let sessionP = null;      // InferenceSession promise
let engineName = '未初始化';

export function getEngineName() { return engineName; }

// wasm 二进制目录：用 import.meta.url 推导绝对地址，
// 避免 ORT 把相对 wasmPaths 拼到模块自身 URL 后面
const ORT_BASE = new URL('../vendor/ort/', import.meta.url).href;
const MODEL_URL = './models/depth-anything-v2-small_int8.onnx';

// 带真实进度的模型下载（26MB，避免演示时观众看到"卡住"）
async function fetchModelWithProgress(onProgress) {
  const res = await fetch(MODEL_URL);
  if (!res.ok) throw new Error(`模型下载失败 HTTP ${res.status}`);
  const total = Number(res.headers.get('content-length') || 0);
  if (!res.body || !total) {
    onProgress?.(0.5);
    return new Uint8Array(await res.arrayBuffer()).buffer;
  }
  const reader = res.body.getReader();
  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress?.(received / total);
  }
  const merged = new Uint8Array(received);
  let offset = 0;
  for (const c of chunks) { merged.set(c, offset); offset += c.length; }
  return merged.buffer;
}

async function loadOrt() {
  if (ortP) return ortP;
  ortP = (async () => {
    // WebGPU 构建包含 wasm EP，可整体兜底
    try {
      const mod = await import('../vendor/ort/ort.webgpu.min.mjs');
      mod.env.wasm.wasmPaths = ORT_BASE;
      return mod;
    } catch (e) {
      console.warn('WebGPU 构建加载失败，退回 WASM 构建', e);
      const mod = await import('../vendor/ort/ort.min.mjs');
      mod.env.wasm.wasmPaths = ORT_BASE;
      return mod;
    }
  })();
  return ortP;
}

// WebGPU 是否真的可用（navigator.gpu 存在但无适配器时 ORT 会静默回退 WASM）
async function hasWebGPU() {
  if (!('gpu' in navigator)) return false;
  try { return !!(await navigator.gpu.requestAdapter()); } catch { return false; }
}

async function getSession() {
  if (sessionP) return sessionP;
  sessionP = (async () => {
    const ort = await loadOrt();
    const eps = [];
    const useGpu = await hasWebGPU();
    if (useGpu) eps.push('webgpu');
    eps.push('wasm');
    const modelBuf = await fetchModelWithProgress();
    const session = await ort.InferenceSession.create(modelBuf, {
      executionProviders: eps,
      graphOptimizationLevel: 'all',
    });
    engineName = useGpu ? 'WebGPU' : 'WASM';
    return session;
  })();
  sessionP.catch(() => { sessionP = null; });
  return sessionP;
}

// 模型预加载（提前触发，让首次构建更快）
// onText(msg) / onProgress(0..1) 用于在 UI 展示真实下载进度
export async function warmup(onText, onProgress) {
  onText?.('正在加载 AI 深度模型（26MB）…');
  try {
    if (!sessionP) {
      sessionP = (async () => {
        const ort = await loadOrt();
        const eps = [];
        const useGpu = await hasWebGPU();
        if (useGpu) eps.push('webgpu');
        eps.push('wasm');
        const modelBuf = await fetchModelWithProgress(onProgress);
        const session = await ort.InferenceSession.create(modelBuf, {
          executionProviders: eps,
          graphOptimizationLevel: 'all',
        });
        engineName = useGpu ? 'WebGPU' : 'WASM';
        return session;
      })();
      sessionP.catch(() => { sessionP = null; });
    }
    await sessionP;
    return true;
  } catch (e) {
    console.error('深度模型加载失败', e);
    sessionP = null;
    engineName = '启发式（离线兜底）';
    return false;
  }
}

// 将图片画到指定尺寸的 canvas 并取出像素
function drawTo(source, w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, w, h);
  return ctx;
}

// 选择满足 14 倍数约束的推理尺寸（贴近原图宽高比）
function inferSize(w, h) {
  let iw = 518;
  let ih = Math.round((h / w) * iw / 14) * 14;
  ih = Math.min(518, Math.max(14, ih));
  return [iw, ih];
}

// ImageNet 归一化 → NCHW float32
function preprocess(ctx, w, h) {
  const { data } = ctx.getImageData(0, 0, w, h);
  const n = w * h;
  const out = new Float32Array(3 * n);
  const mean = [0.485, 0.229, 0.406], std = [0.229, 0.224, 0.225];
  for (let i = 0; i < n; i++) {
    out[i] = (data[i * 4] / 255 - mean[0]) / std[0];
    out[n + i] = (data[i * 4 + 1] / 255 - mean[1]) / std[1];
    out[2 * n + i] = (data[i * 4 + 2] / 255 - mean[2]) / std[2];
  }
  return out;
}

// 相对深度 → 0..1（1 = 近），鲁棒 min/max（1%-99% 分位）
function normalizeDepth(raw, w, h) {
  const n = w * h;
  const sample = new Float32Array(Math.min(n, 60000));
  const step = Math.max(1, Math.floor(n / sample.length));
  let cnt = 0;
  for (let i = 0; i < n && cnt < sample.length; i += step) sample[cnt++] = raw[i];
  sample.sort();
  const lo = sample[Math.floor(cnt * 0.01)];
  const hi = sample[Math.floor(cnt * 0.99)];
  const range = Math.max(1e-6, hi - lo);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v = (raw[i] - lo) / range;
    out[i] = v < 0 ? 0 : v > 1 ? 1 : v;
  }
  return out;
}

// 主入口：image (ImageBitmap/canvas/img) → { depth: Float32Array(workW*workH), w, h, engine }
export async function estimateDepth(image, workW, workH, onProgress) {
  const [iw, ih] = inferSize(workW, workH);
  onProgress?.(`AI 深度估计中（${iw}×${ih}，${engineName || 'WASM'}）…`);
  const ctx = drawTo(image, iw, ih);
  try {
    const session = await getSession();
    const ort = await loadOrt();
    const input = preprocess(ctx, iw, ih);
    const t0 = performance.now();
    const results = await session.run({ pixel_values: new ort.Tensor('float32', input, [1, 3, ih, iw]) });
    const dt = performance.now() - t0;
    const outName = session.outputNames[0];
    const raw = results[outName].data;
    // 输出为 [1, H, W]（与输入同尺寸）
    const dims = results[outName].dims || [];
    const oh = dims[1] || ih;
    const ow = dims[2] || iw;
    const norm = normalizeDepth(raw, ow, oh);
    const depth = resizeDepth(norm, ow, oh, workW, workH);
    return { depth, w: workW, h: workH, engine: engineName, ms: dt };
  } catch (e) {
    console.warn('AI 推理失败，切换启发式深度', e);
    engineName = '启发式（离线兜底）';
    const depth = heuristicDepth(image, workW, workH);
    return { depth, w: workW, h: workH, engine: engineName, ms: 0 };
  }
}

// 双线性缩放深度图
function resizeDepth(src, sw, sh, dw, dh) {
  const out = new Float32Array(dw * dh);
  for (let y = 0; y < dh; y++) {
    const fy = Math.min(sh - 1.001, (y + 0.5) * sh / dh - 0.5);
    const y0 = Math.max(0, Math.floor(fy)), y1 = Math.min(sh - 1, y0 + 1);
    const wy = fy - y0;
    for (let x = 0; x < dw; x++) {
      const fx = Math.min(sw - 1.001, (x + 0.5) * sw / dw - 0.5);
      const x0 = Math.max(0, Math.floor(fx)), x1 = Math.min(sw - 1, x0 + 1);
      const wx = fx - x0;
      const a = src[y0 * sw + x0], b = src[y0 * sw + x1];
      const c = src[y1 * sw + x0], d = src[y1 * sw + x1];
      out[y * dw + x] = a * (1 - wx) * (1 - wy) + b * wx * (1 - wy) + c * (1 - wx) * wy + d * wx * wy;
    }
  }
  return out;
}

// 启发式深度：天际线/地面远、画面中心主体近（模型不可用时的兜底）
function heuristicDepth(image, w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const v = y / h;
    // 天空（上部）与地面远端（下部边缘）远，水平线附近中等
    const lat = (0.5 - v) * Math.PI;
    const skyness = Math.max(0, Math.min(1, (lat - 0.12) / 0.5));       // 越向上越像天空
    const groundness = Math.max(0, Math.min(1, (-lat - 0.5) / 0.6));     // 越向下越像地面
    for (let x = 0; x < w; x++) {
      const u = x / w;
      // 中心区域（主体）更近
      const radial = Math.hypot(u - 0.5, v - 0.5);
      const subject = Math.exp(-Math.pow(radial / 0.22, 2));
      // 亮度高 + 偏蓝 → 天空
      const i = (y * w + x) * 4;
      const lum = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
      const bluish = (data[i + 2] - data[i]) / 255;
      const sky = Math.min(1, Math.max(skyness, bluish * 0.9 + lum * 0.3));
      let d = subject * 0.9 + 0.12;
      d = d * (1 - sky * 0.85) * (1 - groundness * 0.55);
      out[y * w + x] = Math.max(0.02, Math.min(1, d));
    }
  }
  return out;
}

// 验证 Depth Anything V2 (int8 ONNX) 在 Node 下的推理链路
import * as ort from 'onnxruntime-node';

const W = 518, H = 266; // 14 的倍数，接近 2:1 的 ERP 宽高比

// 构造一张合成 ERP 图：上方天空渐变、下方地面、中间一个暖色"物体"
const data = new Float32Array(1 * 3 * H * W);
const mean = [0.485, 0.229, 0.406], std = [0.229, 0.224, 0.225];
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H;
    let r, g, b;
    if (v < 0.45) { // 天空
      const t = v / 0.45; r = 0.35 + 0.4 * t; g = 0.55 + 0.3 * t; b = 0.9;
    } else if (v > 0.62) { // 地面
      r = 0.45; g = 0.38; b = 0.3;
    } else { // 中间物体（暖色，靠近相机）
      const dx = u - 0.5, dy = (v - 0.53) / 0.17;
      const inObj = dx * dx * 3.2 + dy * dy < 1;
      if (inObj) { r = 0.95; g = 0.35; b = 0.2; } else { r = 0.3; g = 0.3; b = 0.35; }
    }
    const i = y * W + x;
    data[i] = (r - mean[0]) / std[0];
    data[H * W + i] = (g - mean[1]) / std[1];
    data[2 * H * W + i] = (b - mean[2]) / std[2];
  }
}

const session = await ort.InferenceSession.create('./models/depth-anything-v2-small_int8.onnx');
console.log('inputs:', session.inputNames, 'outputs:', session.outputNames);
const t0 = Date.now();
const out = await session.run({ pixel_values: new ort.Tensor('float32', data, [1, 3, H, W]) });
const dt = Date.now() - t0;
const depth = out[session.outputNames[0]];
console.log(`output dims: ${depth.dims}, 推理耗时: ${dt}ms`);
const d = depth.data;
let min = Infinity, max = -Infinity;
for (let i = 0; i < d.length; i++) { if (d[i] < min) min = d[i]; if (d[i] > max) max = d[i]; }
console.log(`深度范围: ${min.toFixed(3)} ~ ${max.toFixed(3)}, 尺寸 ${depth.dims[1]}x${depth.dims[2]}`);
// 打印中心区域平均深度 vs 四角（物体应更"近"）
function avg(x0, y0, x1, y1) { let s = 0, n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { s += d[y * depth.dims[2] + x]; n++; } return s / n; }
console.log('中心物体区域均值:', avg(240, 120, 280, 145).toFixed(3), ' 天空区域均值:', avg(100, 10, 200, 40).toFixed(3));

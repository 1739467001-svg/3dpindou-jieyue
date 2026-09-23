// ============================================================
// shooting.js — 拍摄路径模拟器 + 拍摄自检清单
// ============================================================

// ---- 正式实现 ----
const PATHS2 = {
  orbit: {
    hint: '环绕拍摄：围绕主体缓慢转圈，相邻视角保持 70–80% 重叠，最后回到起点形成闭环。',
    frame(g, w, h, t) {
      const cx = w / 2, cy = h / 2 + 8;
      const rx = w * 0.34, ry = h * 0.3;
      g.strokeStyle = 'rgba(230,162,60,0.5)';
      g.lineWidth = 2;
      g.setLineDash([7, 7]);
      g.beginPath();
      g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
      const a = t * 0.0011;
      return { cx, cy, rx, ry, a };
    },
  },
  spiral: {
    hint: '螺旋拍摄：每绕一圈升高约 1 米，确保顶部也被覆盖——适合柱子、树木、雕像。',
    frame(g, w, h, t) {
      const cx = w / 2, cy = h / 2 + 8;
      const rx = w * 0.32, ry = h * 0.28;
      g.strokeStyle = 'rgba(230,162,60,0.5)';
      g.lineWidth = 2;
      const turns = 2.2;
      g.beginPath();
      for (let i = 0; i <= 120; i++) {
        const p = i / 120;
        const aa = p * Math.PI * 2 * turns;
        const rr = 0.55 + 0.45 * p;
        const x = cx + Math.cos(aa) * rx * rr;
        const y = cy + Math.sin(aa) * ry * rr - p * h * 0.32;
        i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      g.stroke();
      const a = t * 0.0011;
      return { cx, cy, rx, ry, a, lift: 0.5 + 0.5 * Math.sin(t * 0.0004) };
    },
  },
  grid: {
    hint: '井字拍摄：室内专用。不同高度（每层约 1 米）来回走动，镜头朝向墙面，门要提前打开。',
    frame(g, w, h, t) {
      const x0 = w * 0.2, y0 = h * 0.24, x1 = w * 0.8, y1 = h * 0.78;
      g.strokeStyle = 'rgba(230,162,60,0.5)';
      g.lineWidth = 2;
      g.setLineDash([7, 7]);
      for (let r = 0; r < 3; r++) {
        const y = y0 + (y1 - y0) * (r / 2);
        g.beginPath();
        g.moveTo(x0, y);
        g.lineTo(x1, y);
        g.stroke();
        g.beginPath();
        g.moveTo(x1, y);
        g.lineTo(x0, y + (y1 - y0) / 2);
        g.stroke();
      }
      g.setLineDash([]);
      const p = (t * 0.00018) % 1;
      const row = Math.floor(p * 3);
      const lp = (p * 3) % 1;
      const y = y0 + (y1 - y0) * (row / 2);
      const x = row % 2 === 0 ? x0 + (x1 - x0) * lp : x1 - (x1 - x0) * lp;
      return { cx: w / 2, cy: h / 2, px: x, py: y };
    },
  },
};

function drawScene(g, w, h, name, t) {
  // 背景
  g.clearRect(0, 0, w, h);
  const bg = g.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#241c15');
  bg.addColorStop(1, '#191410');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);

  // 网格地面
  g.strokeStyle = 'rgba(255,255,255,0.05)';
  g.lineWidth = 1;
  for (let x = 0; x < w; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  for (let y = 0; y < h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }

  const P = PATHS2[name];
  const st = P.frame(g, w, h, t);

  // 主体（被摄物）
  g.fillStyle = '#dd4b26';
  roundRect(g, st.cx - 22, st.cy - 26, 44, 52, 8);
  g.fill();
  g.fillStyle = '#f6f0e3';
  g.font = '700 11px sans-serif';
  g.textAlign = 'center';
  g.fillText('主体', st.cx, st.cy + 4);
  g.textAlign = 'left';

  // 相机
  const px = st.px ?? st.cx + Math.cos(st.a) * st.rx;
  const py = st.py ?? st.cy + Math.sin(st.a) * st.ry - (st.lift ? (st.lift - 0.5) * h * 0.3 : 0);

  // 视角锥
  const ang = Math.atan2(st.cy - py, st.cx - px);
  const grad = g.createRadialGradient(px, py, 4, px, py, 110);
  grad.addColorStop(0, 'rgba(233,162,60,0.4)');
  grad.addColorStop(1, 'rgba(233,162,60,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(px, py);
  g.arc(px, py, 110, ang - 0.8, ang + 0.8);
  g.closePath();
  g.fill();

  // 相机图标
  g.fillStyle = '#0e8f86';
  g.beginPath();
  g.arc(px, py, 9, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#f6f0e3';
  g.lineWidth = 2;
  g.stroke();
  g.fillStyle = '#f6f0e3';
  g.font = '700 10px monospace';
  g.fillText('X5', px - 9, py - 13);

  // 标注
  g.fillStyle = 'rgba(246,240,227,0.75)';
  g.font = '11px monospace';
  g.fillText('← 相邻视角 70-80% 重叠 →', st.cx - 78, h - 14);
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export function initPathSimulator(canvas, hintEl, btnsEl) {
  const g = canvas.getContext('2d');
  let current = 'orbit';
  let raf = null;

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio, 2);
    const w = canvas.clientWidth, h = canvas.clientHeight || 300;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  new ResizeObserver(resize).observe(canvas);

  const loop = (t) => {
    const w = canvas.clientWidth, h = canvas.clientHeight || 300;
    drawScene(g, w, h, current, t);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  btnsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-path]');
    if (!btn) return;
    current = btn.dataset.path;
    btnsEl.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn));
    hintEl.textContent = PATHS2[current].hint;
  });

  return () => cancelAnimationFrame(raf);
}

// ---------- 自检清单 ----------
const CHECK_ITEMS = [
  '使用 8K 30fps 全景视频模式，开启运动 HDR',
  '参数固定为手动，未使用自动模式',
  '拍摄前擦拭了镜头',
  '相机距主体 1–2 米',
  '步行速度 < 1 m/s（光线暗时更慢）',
  '围绕主体多角度移动，未原地旋转',
  '相邻视角 70–80% 重叠',
  '在不同高度（约 1 米间隔）重复拍摄',
  '复杂结构/阴影角落靠近补拍',
  '单次录制 3–5 分钟',
  '场景内无人员走动、无 LED 闪烁',
  '回到起点附近结束（数据闭环）',
];

export function initChecklist(listEl, fillEl, scoreEl) {
  const items = CHECK_ITEMS.map((text, i) => {
    const li = document.createElement('li');
    li.textContent = text;
    li.addEventListener('click', () => {
      li.classList.toggle('on');
      updateScore();
    });
    listEl.appendChild(li);
    return li;
  });

  const updateScore = () => {
    const on = items.filter(li => li.classList.contains('on')).length;
    const score = Math.round((on / items.length) * 100);
    fillEl.style.width = score + '%';
    scoreEl.textContent = `${score} / 100`;
  };
  updateScore();
}

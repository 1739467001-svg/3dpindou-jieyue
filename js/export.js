// ============================================================
// export.js — 导出：分层施工图纸 PNG / 材料清单 CSV / 作品 JSON
// ============================================================

// 下载工具
export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 0, 0];
}

/**
 * 分层图纸：每一层一张网格图，纵向排列为一幅长卷
 * 每个格子 = 一颗豆子；格子足够大时绘制色号
 */
export function exportPatternPNG(beads, gridN, palette, stats, filename = 'beadorbit-分层图纸.png') {
  const layerH = new Array(gridN).fill(0);
  for (const b of beads) layerH[b.y] = Math.max(layerH[b.y], b.z + 1);
  const usedLayers = [];
  for (let y = 0; y < gridN; y++) if (layerH[y] > 0) usedLayers.push(y);

  const cell = Math.max(8, Math.min(30, Math.floor(1300 / gridN)));
  const pad = 10;
  const labelH = 26;
  const headerH = 74;
  const layerH_total = gridN * cell + labelH;
  const width = gridN * cell + pad * 2;
  const height = headerH + usedLayers.length * layerH_total + pad * 2 + 30;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // 纸面背景
  ctx.fillStyle = '#f6f0e3';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = '#211b14';
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, width - 3, height - 3);

  // 头部
  ctx.fillStyle = '#211b14';
  ctx.font = `900 30px Georgia, "Songti SC", serif`;
  ctx.fillText('BeadOrbit 分层施工图纸', pad + 8, 44);
  ctx.font = `13px Menlo, monospace`;
  ctx.fillStyle = '#4b4335';
  ctx.fillText(
    `共 ${usedLayers.length} 层 · ${stats.beadCount} 颗豆 · ${stats.colorCount} 色 · 成品约 ${stats.sizeText} · 色板 ${palette.name}`,
    pad + 8, 64
  );

  // 每层
  let oy = headerH;
  for (const y of usedLayers) {
    // 层标签
    ctx.fillStyle = '#211b14';
    ctx.font = `700 14px Menlo, monospace`;
    ctx.fillText(`第 ${y + 1} 层（从底部数）`, pad + 8, oy + 17);
    oy += labelH;

    // 网格（z 为行，x 为列）
    for (let z = 0; z < gridN; z++) {
      for (let x = 0; x < gridN; x++) {
        const px = pad + x * cell;
        const py = oy + z * cell;
        ctx.fillStyle = '#e9dec9';
        ctx.fillRect(px, py, cell, cell);
        ctx.strokeStyle = '#211b1422';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, cell - 1, cell - 1);
      }
    }
    for (const b of beads) {
      if (b.y !== y) continue;
      const c = palette.colors[b.p];
      const [r, g, bl] = hexToRgb(c.hex);
      ctx.fillStyle = `rgb(${r},${g},${bl})`;
      ctx.fillRect(pad + b.x * cell, oy + b.z * cell, cell, cell);
      if (cell >= 16) {
        ctx.fillStyle = (r * 0.299 + g * 0.587 + bl * 0.114) > 140 ? '#211b14' : '#f6f0e3';
        ctx.font = `${Math.floor(cell * 0.34)}px Menlo, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(c.code, pad + b.x * cell + cell / 2, oy + b.z * cell + cell / 2 + 1);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
      }
    }
    // 层边框
    ctx.strokeStyle = '#211b14';
    ctx.lineWidth = 2;
    ctx.strokeRect(pad, oy, gridN * cell, gridN * cell);
    oy += gridN * cell;
  }

  // 页脚
  ctx.fillStyle = '#7d7263';
  ctx.font = `12px Menlo, monospace`;
  ctx.fillText('打印后按层拼装：每层按网格摆放豆子，从第 1 层开始逐层向上叠加（关键层可用熨烫纸轻烫固定）', pad + 8, height - 14);

  canvas.toBlob(blob => {
    download(blob, filename);
  }, 'image/png');
}

/** 材料清单 CSV（Excel 友好，带 BOM 头） */
export function exportBOMCSV(usage, palette, stats, filename = 'beadorbit-材料清单.csv') {
  const lines = [];
  lines.push('# BeadOrbit 360°立体拼豆 · 材料清单');
  lines.push(`# 豆子总数,${stats.beadCount},用到颜色,${stats.colorCount},层数,${stats.layerCount},成品尺寸,${stats.sizeText}`);
  lines.push('色号,颜色,Hex,数量,占比');
  const entries = [...usage.entries()].sort((a, b) => b[1] - a[1]);
  for (const [idx, count] of entries) {
    const c = palette.colors[idx];
    const pct = ((count / stats.beadCount) * 100).toFixed(1) + '%';
    lines.push(`${c.code},${c.name},${c.hex},${count},${pct}`);
  }
  const csv = '\ufeff' + lines.join('\n');
  download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), filename);
}

/** 作品 JSON（可分享/重载） */
export function exportModelJSON(model, filename = 'beadorbit-作品.json') {
  const json = JSON.stringify(model);
  download(new Blob([json], { type: 'application/json' }), filename);
}

/**
 * 分享卡片：3D 截图 + 作品统计 + 色板（社交平台比例 1200×630）
 */
export function exportShareCard(shotDataUrl, stats, palette, usage, filename = 'beadorbit-分享卡片.png') {
  const W = 1200, H = 630;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  // 纸面背景
  ctx.fillStyle = '#f6f0e3';
  ctx.fillRect(0, 0, W, H);
  // 右侧深色作品区
  const shot = new Image();
  shot.onload = () => {
    // 左侧 3D 截图区（深底）
    const sx = 40, sy = 96, sw = 560, sh = 494;
    ctx.fillStyle = '#191410';
    roundRectPath(ctx, sx, sy, sw, sh, 18);
    ctx.fill();
    ctx.strokeStyle = '#211b14';
    ctx.lineWidth = 3;
    roundRectPath(ctx, sx, sy, sw, sh, 18);
    ctx.stroke();
    // 截图按比例放入
    const ratio = Math.min(sw / shot.width, sh / shot.height);
    const dw = shot.width * ratio, dh = shot.height * ratio;
    ctx.drawImage(shot, sx + (sw - dw) / 2, sy + (sh - dh) / 2, dw, dh);

    // 顶部标题
    ctx.fillStyle = '#211b14';
    ctx.font = '900 44px Georgia, "Songti SC", serif';
    ctx.fillText('我的 360° 立体拼豆作品', 40, 62);
    ctx.font = '700 20px Menlo, monospace';
    ctx.fillStyle = '#dd4b26';
    ctx.fillText('BeadOrbit · 360°立体拼豆工坊', 660, 62);

    // 统计卡片
    const cards = [
      [String(stats.beadCount).toLocaleString(), '豆子总数'],
      [String(stats.colorCount), '用到颜色'],
      [String(stats.layerCount), '层数'],
      [stats.sizeText, '成品尺寸'],
    ];
    cards.forEach(([num, label], i) => {
      const cx = 660 + (i % 2) * 250, cy = 108 + Math.floor(i / 2) * 108;
      ctx.fillStyle = '#ffffff';
      roundRectPath(ctx, cx, cy, 230, 92, 12);
      ctx.fill();
      ctx.strokeStyle = '#211b14';
      ctx.lineWidth = 2.5;
      roundRectPath(ctx, cx, cy, 230, 92, 12);
      ctx.stroke();
      ctx.fillStyle = ['#dd4b26', '#0e8f86', '#e6a23c', '#3f7fbf'][i];
      ctx.font = '900 34px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText(num, cx + 115, cy + 46);
      ctx.fillStyle = '#7d7263';
      ctx.font = '15px sans-serif';
      ctx.fillText(label, cx + 115, cy + 72);
      ctx.textAlign = 'left';
    });

    // 色板（TOP 10）
    ctx.fillStyle = '#211b14';
    ctx.font = '700 18px sans-serif';
    ctx.fillText('用到的拼豆色号', 660, 372);
    const top = [...usage.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    top.forEach(([idx, count], i) => {
      const c = palette.colors[idx];
      const cx = 660 + (i % 5) * 104, cy = 392 + Math.floor(i / 5) * 76;
      ctx.fillStyle = c.hex;
      ctx.beginPath();
      ctx.arc(cx + 24, cy + 24, 21, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#211b14';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx + 24, cy + 24, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#14100c';
      ctx.fill();
      ctx.fillStyle = '#4b4335';
      ctx.font = '700 14px Menlo, monospace';
      ctx.fillText(c.code, cx + 52, cy + 20);
      ctx.fillStyle = '#7d7263';
      ctx.font = '12px sans-serif';
      ctx.fillText(`×${count}`, cx + 52, cy + 38);
    });

    // 底部信息
    ctx.fillStyle = '#4b4335';
    ctx.font = '15px sans-serif';
    const hours = stats.hours < 1 ? `${Math.round(stats.hours * 60)} 分钟` : `${stats.hours.toFixed(1)} 小时`;
    ctx.fillText(`预计工时 ${hours} · 难度 ${stats.beadCount < 800 ? '★' : stats.beadCount < 2500 ? '★★' : stats.beadCount < 6000 ? '★★★' : '★★★★'} · 每层需钉板 ${stats.boards} 个`, 660, 560);
    ctx.fillStyle = '#7d7263';
    ctx.font = '13px sans-serif';
    ctx.fillText('用影石全景相机拍下世界，AI 把它变成可以逐颗拼装的立体拼豆', 40, 560);
    ctx.fillText('2026 影石 Insta360 Bold Maker 智能影像挑战赛 · AI+影像产品开发', 40, 582);

    canvas.toBlob(b => download(b, filename), 'image/png');
  };
  shot.src = shotDataUrl;
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function importModelJSON(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const model = JSON.parse(reader.result);
        if (!model.beads || !model.palette) throw new Error('文件格式不正确');
        resolve(model);
      } catch (e) { reject(e); }
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsText(file);
  });
}

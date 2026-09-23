// 新功能测试：AI 自动调参 / 分享卡片 / 首次引导 / 场景预设
import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--no-sandbox'] });
const errors = [];
const R = [];
const log = (n, p, d = '') => { R.push([n, p]); console.log(`${p ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`); };
try {
  const p = await b.newPage({ viewport: { width: 1000, height: 680 } });
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  p.on('pageerror', e => errors.push('PAGEERROR: ' + e.message.slice(0, 200)));
  await p.goto('http://localhost:8080', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await p.waitForTimeout(2000);

  // 1. 首次访问引导出现
  const guide = await p.evaluate(() => !!document.querySelector('.first-visit'));
  log('首次访问引导', guide);

  await p.locator('.nav-links a[href="#studio"]').click({ timeout: 120000, noWaitAfter: true });
  await p.waitForTimeout(1500); // 等 smooth scroll 结束
  await p.locator('.src-tab[data-src="sample"]').click({ timeout: 120000, noWaitAfter: true });

  // 2. 场景预设：选星球后底座应变 0°
  await p.locator('.sample-card[data-sample="planet"]').click({ timeout: 120000, noWaitAfter: true });
  await p.waitForTimeout(400);
  const preset = await p.evaluate(() => ({
    base: document.getElementById('valBase').textContent,
    grid: document.getElementById('valGrid').textContent,
  }));
  log('星球场景预设生效', preset.base === '0°' && preset.grid.startsWith('48'), `底座=${preset.base} 精度=${preset.grid}`);
  await p.waitForFunction(() => {
    const el = document.getElementById('statBeads');
    return el && el.textContent !== '—' && /\d/.test(el.textContent);
  }, { timeout: 300000 }).catch(() => {});
  const s1 = await p.evaluate(() => document.getElementById('statBeads').textContent);
  log('星球拼豆完成', /\d/.test(s1), `豆=${s1}`);

  // 3. AI 自动调参
  const before = await p.evaluate(() => ({
    cut: document.getElementById('valCut').textContent,
    near: document.getElementById('valNear').textContent,
  }));
  await p.locator('#btnAutoTune').click({ timeout: 180000, noWaitAfter: true });
  await p.waitForFunction((prev) => {
    const el = document.getElementById('statBeads');
    return el && el.textContent !== '—' && el.textContent !== prev;
  }, s1, { timeout: 300000 }).catch(() => {});
  const after = await p.evaluate(() => ({
    cut: document.getElementById('valCut').textContent,
    near: document.getElementById('valNear').textContent,
    beads: document.getElementById('statBeads').textContent,
    toast: [...document.querySelectorAll('.toast')].map(t => t.textContent).join('|').slice(0, 80),
  }));
  log('AI 自动调参', after.cut !== before.cut || after.near !== before.near,
    `剔除 ${before.cut}→${after.cut} · 深度 ${before.near}→${after.near} · 豆=${after.beads}`);
  console.log('   toast:', after.toast);

  // 4. 分享卡片下载
  const dlP = p.waitForEvent('download', { timeout: 90000 });
  await p.locator('#btnShareCard').click({ timeout: 120000, noWaitAfter: true });
  const dl = await dlP.catch(() => null);
  log('分享卡片生成', !!dl, dl?.suggestedFilename() || '超时');
  if (dl) {
    const path = await dl.path();
    const { statSync, copyFileSync } = await import('node:fs');
    const size = statSync(path).size;
    copyFileSync(path, 'gui-test-screenshots/n1_share_card.png');
    log('分享卡片非空', size > 20000, `${(size / 1024).toFixed(0)}KB`);
  }
} finally { await b.close(); }
console.log('\n错误:', errors.length ? errors.slice(0, 8).join('\n') : '（无）');
const failed = R.filter(r => !r[1]).length;
console.log(`===== ${R.length - failed}/${R.length} 通过 =====`);
process.exit(failed ? 1 : 0);

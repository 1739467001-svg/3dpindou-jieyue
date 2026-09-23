// 多帧融合测试
import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--no-sandbox'] });
const errors = [];
try {
  const p = await b.newPage({ viewport: { width: 1000, height: 680 } });
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  p.on('pageerror', e => errors.push('PAGEERROR: ' + e.message.slice(0, 200)));
  await p.goto('http://localhost:8080', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await p.waitForTimeout(2500);
  await p.locator('.nav-links a[href="#studio"]').click({ timeout: 120000, noWaitAfter: true });
  await p.locator('.src-tab[data-src="video"]').click({ timeout: 120000, noWaitAfter: true });
  await p.locator('#fileVideo').setInputFiles('/tmp/test-360.webm', { timeout: 60000 });
  await p.waitForFunction(() => !document.getElementById('frameStrip').hidden, { timeout: 60000 }).catch(() => {});
  const before = await p.evaluate(() => document.getElementById('statBeads').textContent);
  await p.locator('#btnFuseAll').click({ timeout: 120000, noWaitAfter: true });
  await p.waitForFunction((prev) => {
    const el = document.getElementById('statBeads');
    return el && el.textContent !== '—' && el.textContent !== prev;
  }, before, { timeout: 300000 }).catch(() => {});
  await p.waitForTimeout(1000);
  const s = await p.evaluate(() => ({
    beads: document.getElementById('statBeads').textContent,
    layers: document.getElementById('statLayers').textContent,
    steps: [...document.querySelectorAll('.pipe-step')].map(e => e.className.includes('done') ? 1 : 0).join(''),
    toast: [...document.querySelectorAll('.toast')].map(t => t.textContent).join('|').slice(0, 90),
  }));
  const ok = /\d/.test(s.beads) && s.beads !== '—' && s.beads !== before;
  console.log(`${ok ? '✅' : '❌'} 多帧融合 → 拼豆 — 豆=${s.beads} 层=${s.layers} 步骤=${s.steps}`);
  if (s.toast.includes('失败') || s.toast.includes('太少')) console.log('   toast:', s.toast);
  console.log('错误:', errors.length ? errors.slice(0, 5).join('\n') : '（无）');
  process.exit(ok && !errors.length ? 0 : 1);
} finally { await b.close(); }

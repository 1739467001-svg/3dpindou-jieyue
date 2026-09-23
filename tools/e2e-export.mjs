// 导出专项复测（长超时，顺序等待）
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
  await p.waitForTimeout(1500); // 等 smooth scroll 结束
  await p.locator('.src-tab[data-src="sample"]').click({ timeout: 120000, noWaitAfter: true });
  await p.locator('.sample-card[data-sample="mushroom"]').click({ timeout: 120000, noWaitAfter: true });
  await p.waitForFunction(() => {
    const el = document.getElementById('statBeads');
    return el && el.textContent !== '—' && /\d/.test(el.textContent);
  }, { timeout: 300000 }).catch(() => {});
  await p.waitForTimeout(2000);

  const results = [];
  for (const [btn, name] of [['#btnExportCsv', 'CSV'], ['#btnExportPng', 'PNG'], ['#btnExportJson', 'JSON']]) {
    const dlP = p.waitForEvent('download', { timeout: 90000 });
    await p.locator(btn).click({ timeout: 120000, noWaitAfter: true });
    const dl = await dlP.catch(() => null);
    results.push(`${name}: ${dl ? dl.suggestedFilename() : '❌ 超时'}`);
  }
  console.log(results.join('\n'));
  // 载入刚导出的 JSON（先挂 filechooser 监听，再点击）
  const jsonDl = await Promise.all([
    p.waitForEvent('download', { timeout: 90000 }),
    p.locator('#btnExportJson').click({ timeout: 120000, noWaitAfter: true }),
  ]).then(r => r[0]).catch(() => null);
  if (jsonDl) {
    const path = await jsonDl.path();
    const [chooser] = await Promise.all([
      p.waitForEvent('filechooser', { timeout: 30000 }),
      p.locator('#btnImportJson').click({ timeout: 120000, noWaitAfter: true }),
    ]);
    await chooser.setFiles(path);
    await p.waitForTimeout(3000);
    const reloaded = await p.evaluate(() => ({
      beads: document.getElementById('statBeads').textContent,
      hud: document.getElementById('hudCount').textContent,
    }));
    console.log(`JSON 载入: ${reloaded.beads} 豆 / HUD ${reloaded.hud}`);
    if (!/\d/.test(reloaded.beads)) process.exitCode = 1;
  }
  console.log('错误:', errors.length ? errors.join('\n') : '（无）');
  const ok = results.every(r => !r.includes('❌')) && !errors.length;
  process.exit(ok && !process.exitCode ? 0 : 1);
} finally { await b.close(); }

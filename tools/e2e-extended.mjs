// 扩展测试：图片上传 / 多场景 / 移动端 / 导出图纸视觉检查
import { chromium } from 'playwright';
import { mkdirSync, copyFileSync } from 'node:fs';
mkdirSync('gui-test-screenshots', { recursive: true });

const errors = [];
const R = [];
const log = (n, p, d = '') => { R.push([n, p]); console.log(`${p ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`); };

const browser = await chromium.launch({
  channel: 'chrome', headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 680 } });
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message.slice(0, 200)));
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url().slice(0, 100)); });

  await page.goto('http://localhost:8080', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(2500);

  // ---- 1. 生成一张"用户保存的全景图"文件（城堡场景），然后走图片上传 ----
  const dataUrl = await page.evaluate(() => {
    const c = window.__beadorbit.renderSample('castle', 768, 384);
    return c.toDataURL('image/png');
  });
  const b64 = dataUrl.split(',')[1];
  await import('node:fs').then(fs => fs.writeFileSync('/tmp/user-panorama.png', Buffer.from(b64, 'base64')));
  log('生成测试用全景图文件', b64.length > 10000, `${(b64.length / 1024).toFixed(0)}KB`);

  await page.locator('.nav-links a[href="#studio"]').click({ timeout: 120000, noWaitAfter: true });
  await page.waitForTimeout(1500); // 等 smooth scroll 结束
  await page.locator('#fileImage').setInputFiles('/tmp/user-panorama.png', { timeout: 60000 });
  await page.waitForTimeout(800);
  const dzText = await page.evaluate(() => document.querySelector('.toast')?.textContent || '');
  log('图片上传被接受', dzText.includes('已载入'), dzText.slice(0, 50));
  await page.locator('#btnBuild').click({ timeout: 120000, noWaitAfter: true });
  await page.waitForFunction(() => {
    const el = document.getElementById('statBeads');
    return el && el.textContent !== '—' && /\d/.test(el.textContent);
  }, { timeout: 300000 }).catch(() => {});
  const s1 = await page.evaluate(() => ({
    beads: document.getElementById('statBeads').textContent,
    colors: document.getElementById('statColors').textContent,
    layers: document.getElementById('statLayers').textContent,
  }));
  log('上传图片 → 拼豆', /\d/.test(s1.beads) && s1.beads !== '—', `豆=${s1.beads} 色=${s1.colors} 层=${s1.layers}`);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'gui-test-screenshots/x1_upload.png', timeout: 90000 });

  // ---- 2. 导出分层图纸并保存副本供目检 ----
  const dl = await Promise.all([
    page.waitForEvent('download', { timeout: 60000 }).catch(() => null),
    page.locator('#btnExportPng').click({ timeout: 60000, noWaitAfter: true }),
  ]).then(r => r[0]);
  if (dl) {
    const p = await dl.path();
    copyFileSync(p, 'gui-test-screenshots/x2_pattern_export.png');
    log('分层图纸导出', true, dl.suggestedFilename());
  } else log('分层图纸导出', false, '无下载');

  // ---- 3. 其他示例场景 ----
  for (const [name, label] of [['robot', '机器人'], ['planet', '星球']]) {
    const before = await page.evaluate(() => document.getElementById('statBeads').textContent);
    await page.locator('.src-tab[data-src="sample"]').click({ timeout: 120000, noWaitAfter: true });
    await page.locator(`.sample-card[data-sample="${name}"]`).click({ timeout: 120000, noWaitAfter: true });
    // 等统计数字发生变化（新构建完成）
    await page.waitForFunction((prev) => {
      const el = document.getElementById('statBeads');
      return el && el.textContent !== '—' && el.textContent !== prev;
    }, before, { timeout: 300000 }).catch(() => {});
    await page.waitForTimeout(1200);
    const s = await page.evaluate(() => ({
      beads: document.getElementById('statBeads').textContent,
      colors: document.getElementById('statColors').textContent,
      layers: document.getElementById('statLayers').textContent,
      toast: [...document.querySelectorAll('.toast')].map(t => t.textContent).join('|').slice(0, 90),
    }));
    log(`示例场景「${label}」→ 拼豆`, s.beads !== before && /\d/.test(s.beads), `豆=${s.beads} 色=${s.colors} 层=${s.layers}`);
    if (s.toast.includes('失败') || s.toast.includes('太少')) console.log('   toast:', s.toast);
    await page.screenshot({ path: `gui-test-screenshots/x3_${name}.png`, timeout: 90000 });
  }

  // ---- 4. 逐颗模式幽灵可见性 ----
  await page.locator('.tool[data-mode="bead"]').click({ timeout: 120000, noWaitAfter: true });
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'gui-test-screenshots/x4_ghost.png', timeout: 90000 });
  const ghostOk = await page.evaluate(() => document.getElementById('hudMode').textContent.includes('逐颗'));
  log('逐颗模式 + 幽灵豆', ghostOk);

  // ---- 5. 移动端布局 ----
  await page.setViewportSize({ width: 420, height: 780 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'gui-test-screenshots/x5_mobile_hero.png', timeout: 90000, fullPage: false });
  await page.evaluate(() => document.getElementById('studio').scrollIntoView());
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'gui-test-screenshots/x6_mobile_studio.png', timeout: 90000 });
  const mobileOk = await page.evaluate(() => {
    const grid = document.querySelector('.studio-grid');
    return grid && getComputedStyle(grid).gridTemplateColumns.split(' ').length === 1;
  });
  log('移动端单列布局', mobileOk);
  await page.setViewportSize({ width: 1000, height: 680 });
} finally {
  await browser.close();
}

console.log('\n===== 控制台错误 =====');
console.log(errors.length ? errors.slice(0, 10).join('\n') : '（无）');
const failed = R.filter(r => !r[1]).length;
console.log(`\n===== ${R.length - failed}/${R.length} 通过 =====`);
process.exit(failed ? 1 : 0);

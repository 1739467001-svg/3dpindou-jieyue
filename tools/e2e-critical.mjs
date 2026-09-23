// 关键路径测试：示例场景 → 完整流水线 → 模式切换 → 导出 → 助手
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
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
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message.slice(0, 300)));
  page.on('requestfailed', r => errors.push('REQFAIL: ' + r.url().slice(0, 120)));
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url().slice(0, 120)); });

  await page.goto('http://localhost:8080', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(2000);
  log('页面加载', (await page.title()).includes('BeadOrbit'));
  await page.screenshot({ path: 'gui-test-screenshots/c1_hero.png', timeout: 90000 });

  // 滚到工坊，选示例场景
  await page.locator('.nav-links a[href="#studio"]').click({ timeout: 120000, noWaitAfter: true });
  await page.waitForTimeout(1500); // 等 smooth scroll 结束
  await page.locator('.src-tab[data-src="sample"]').click({ timeout: 120000, noWaitAfter: true });
  await page.screenshot({ path: 'gui-test-screenshots/c2_studio.png', timeout: 90000 });
  await page.locator('.sample-card[data-sample="mushroom"]').click({ timeout: 120000, noWaitAfter: true });

  // 等流水线完成（最多 5 分钟）
  const t0 = Date.now();
  await page.waitForFunction(() => {
    const el = document.getElementById('statBeads');
    return el && el.textContent !== '—' && /\d/.test(el.textContent);
  }, { timeout: 300000 }).catch(() => {});
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  const s = await page.evaluate(() => ({
    beads: document.getElementById('statBeads').textContent,
    colors: document.getElementById('statColors').textContent,
    layers: document.getElementById('statLayers').textContent,
    size: document.getElementById('statSize').textContent,
    steps: [...document.querySelectorAll('.pipe-step')].map(e => e.className.includes('done') ? 1 : 0).join(''),
    toast: [...document.querySelectorAll('.toast')].map(t => t.textContent).join('|').slice(0, 120),
  }));
  log('AI 流水线产出拼豆模型', /\d/.test(s.beads) && s.beads !== '—',
    `${secs}s | 豆=${s.beads} 色=${s.colors} 层=${s.layers} 尺寸=${s.size} | 步骤=${s.steps}`);
  if (s.toast) console.log('   toast:', s.toast);

  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'gui-test-screenshots/c3_build.png', timeout: 90000 });

  if (/\d/.test(s.beads)) {
    // 逐层 → 逐颗
    await page.locator('.tool[data-mode="bead"]').click({ timeout: 120000, noWaitAfter: true });
    await page.waitForTimeout(500);
    const mode1 = await page.evaluate(() => document.getElementById('hudMode').textContent);
    log('逐颗拼装模式', mode1.includes('逐颗'), mode1);
    for (let i = 0; i < 6; i++) {
      await page.locator('#stageCanvas').click({ position: { x: 320, y: 240 }, timeout: 20000 });
      await page.waitForTimeout(150);
    }
    const hud = await page.evaluate(() => document.getElementById('hudCount').textContent);
    log('逐颗放置 6 颗', !hud.startsWith('0 /'), hud);
    await page.screenshot({ path: 'gui-test-screenshots/c4_bead.png', timeout: 90000 });

    // 观察 + 自转
    await page.locator('.tool[data-mode="orbit"]').click({ timeout: 120000, noWaitAfter: true });
    await page.locator('#btnSpin').click({ timeout: 120000, noWaitAfter: true });
    await page.waitForTimeout(1800);
    await page.screenshot({ path: 'gui-test-screenshots/c5_orbit.png', timeout: 90000 });
    log('自转开启', await page.evaluate(() => document.getElementById('btnSpin').classList.contains('active')));

    // 导出
    const d1 = await Promise.all([
      page.waitForEvent('download', { timeout: 30000 }).catch(() => null),
      page.locator('#btnExportCsv').click({ timeout: 120000, noWaitAfter: true }),
    ]).then(r => r[0]);
    log('导出 CSV', !!d1, d1?.suggestedFilename() || '');
    const d2 = await Promise.all([
      page.waitForEvent('download', { timeout: 60000 }).catch(() => null),
      page.locator('#btnExportPng').click({ timeout: 120000, noWaitAfter: true }),
    ]).then(r => r[0]);
    log('导出分层图纸 PNG', !!d2, d2?.suggestedFilename() || '');
  }

  // AI 助手
  await page.locator('#fabAssistant').click({ timeout: 120000, noWaitAfter: true });
  await page.waitForTimeout(400);
  await page.locator('#assistantText').fill('立体作品怎么拼不散？');
  await page.locator('#assistantForm button[type="submit"]').click({ timeout: 120000, noWaitAfter: true });
  await page.waitForTimeout(1500);
  const reply = await page.evaluate(() => {
    const m = [...document.querySelectorAll('.msg.bot')];
    return m.length ? m[m.length - 1].textContent : '';
  });
  log('AI 助手回答', reply.length > 20, reply.slice(0, 36) + '…');
  await page.screenshot({ path: 'gui-test-screenshots/c6_assistant.png', timeout: 90000 });
} finally {
  await browser.close();
}

console.log('\n===== 控制台错误 =====');
console.log(errors.length ? errors.slice(0, 10).join('\n') : '（无）');
const failed = R.filter(r => !r[1]).length;
console.log(`\n===== ${R.length - failed}/${R.length} 通过 =====`);
process.exit(failed ? 1 : 0);

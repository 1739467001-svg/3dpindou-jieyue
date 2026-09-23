// 现实模拟测试：熨烫动画 / 冷却 / 看板 / 互锁 tabs / 空心省豆 / 重量
import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--no-sandbox'] });
const errors = [];
const R = [];
const log = (n, p, d = '') => { R.push([n, p]); console.log(`${p ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`); };
try {
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  p.on('pageerror', e => errors.push('PAGEERROR: ' + e.message.slice(0, 250)));
  await p.goto('http://localhost:8080', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await p.waitForTimeout(2500);
  await p.locator('.nav-links a[href="#studio"]').click({ timeout: 120000, noWaitAfter: true });
  await p.waitForTimeout(1200);

  // 用模板快速造一个有内容的作品
  await p.locator('.src-tab[data-mode="new"]').click({ timeout: 60000, noWaitAfter: true });
  await p.locator('[data-tpl="doll"]').click({ timeout: 60000, noWaitAfter: true });
  await p.waitForTimeout(1500);
  const tpl = await p.evaluate(() => ({
    beads: document.getElementById('statBeads').textContent,
    layers: document.getElementById('layerTotal').textContent,
    weight: document.getElementById('statWeight').textContent,
    chips: document.querySelectorAll('.lchip').length,
  }));
  log('模板生成小人偶', /\d/.test(tpl.beads) && tpl.chips > 10, `${tpl.beads} 豆 / ${tpl.layers} 层 / ${tpl.weight} / 看板 ${tpl.chips} 层`);

  // 熨烫当前层（应播放动画）
  await p.locator('#btnIronLayer').click({ timeout: 60000, noWaitAfter: true });
  await p.waitForTimeout(900);
  const midIron = await p.evaluate(() => ({
    // 动画进行中：熨斗/纸可见无法直接读，用状态文字判断
    level: document.getElementById('valIronLevel').textContent,
  }));
  await p.waitForFunction(() => {
    const chip = document.querySelector('.lchip.st-hot, .lchip.st-done');
    return !!chip;
  }, { timeout: 20000 }).catch(() => {});
  const afterIron = await p.evaluate(() => ({
    hot: document.querySelectorAll('.lchip.st-hot').length,
    done: document.querySelectorAll('.lchip.st-done').length,
    toast: [...document.querySelectorAll('.toast')].map(t => t.textContent).join('|').slice(0, 60),
  }));
  log('熨烫动画 → 层进入冷却', afterIron.hot + afterIron.done >= 1, `🔥${afterIron.hot} ✅${afterIron.done} | ${afterIron.toast}`);
  await p.screenshot({ path: 'gui-test-screenshots/r1_iron.png', timeout: 90000 });

  // 本层发烫提示 + 叠层警示（往上换一层后，下层仍烫）
  const hotWarn = await p.evaluate(() => {
    const w = document.getElementById('warnBox');
    return { hidden: w.hidden, text: w.textContent.slice(0, 50) };
  });
  log('本层冷却中提示', !hotWarn.hidden && hotWarn.text.includes('冷却中'), hotWarn.text);
  // 往上走一层：下层仍烫 → 应警告不能叠层
  await p.locator('#btnLayerNext').click({ timeout: 30000, noWaitAfter: true }).catch(() => {});
  await p.waitForTimeout(500);
  const stackWarn = await p.evaluate(() => {
    const w = document.getElementById('warnBox');
    return { hidden: w.hidden, text: w.textContent.slice(0, 60) };
  });
  log('未冷却禁叠层警示', !stackWarn.hidden && stackWarn.text.includes('降温'), stackWarn.text);

  // 等冷却完成（10 秒）
  await p.waitForFunction(() => document.querySelectorAll('.lchip.st-hot').length === 0 && document.querySelectorAll('.lchip.st-done').length >= 1, { timeout: 20000 }).catch(() => {});
  const cooled = await p.evaluate(() => ({
    done: document.querySelectorAll('.lchip.st-done').length,
    hot: document.querySelectorAll('.lchip.st-hot').length,
  }));
  log('冷却完成 → 状态变已熨已冷', cooled.hot === 0 && cooled.done >= 1, `✅${cooled.done} 🔥${cooled.hot}`);

  // 互锁 tabs
  const beforeTabs = await p.evaluate(() => document.getElementById('statBeads').textContent);
  await p.locator('#btnTabs').click({ timeout: 60000, noWaitAfter: true });
  await p.waitForTimeout(1200);
  const afterTabs = await p.evaluate(() => ({
    beads: document.getElementById('statBeads').textContent,
    toast: [...document.querySelectorAll('.toast')].map(t => t.textContent).join('|').slice(0, 50),
  }));
  log('互锁 tabs 生成', afterTabs.beads !== beforeTabs, `${beforeTabs} → ${afterTabs.beads} | ${afterTabs.toast}`);
  await p.screenshot({ path: 'gui-test-screenshots/r2_tabs.png', timeout: 90000 });

  // 空心省豆
  const beforeHollow = await p.evaluate(() => document.getElementById('statBeads').textContent);
  await p.locator('#btnHollow').click({ timeout: 60000, noWaitAfter: true });
  await p.waitForTimeout(1200);
  const afterHollow = await p.evaluate(() => ({
    beads: document.getElementById('statBeads').textContent,
    toast: [...document.querySelectorAll('.toast')].map(t => t.textContent).join('|').slice(0, 50),
    floating: document.getElementById('warnBox').textContent.includes('悬空'),
  }));
  log('空心省豆', afterHollow.beads !== beforeHollow, `${beforeHollow} → ${afterHollow.beads} | ${afterHollow.toast}`);
  await p.screenshot({ path: 'gui-test-screenshots/r3_hollow.png', timeout: 90000 });

  // 看板点击跳层
  await p.locator('.lchip').nth(2).click({ timeout: 30000, noWaitAfter: true });
  await p.waitForTimeout(600);
  const jumped = await p.evaluate(() => document.getElementById('layerCur').textContent);
  log('看板点击跳层', jumped === '3', `第 ${jumped} 层`);
} finally { await b.close(); }
console.log('\n错误:', errors.length ? errors.slice(0, 8).join('\n') : '（无）');
const failed = R.filter(r => !r[1]).length;
console.log(`===== ${R.length - failed}/${R.length} 通过 =====`);
process.exit(failed ? 1 : 0);

// 手机端优化验证：汉堡菜单 / 触控目标 / 分节截图
import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--no-sandbox'] });
const issues = [];
try {
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  p.on('pageerror', e => issues.push('PAGEERROR: ' + e.message.slice(0, 150)));
  await p.goto('http://localhost:8080', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await p.waitForTimeout(2200);

  // 1. 汉堡菜单开合
  const toggleVisible = await p.evaluate(() => getComputedStyle(document.getElementById('navToggle')).display !== 'none');
  await p.locator('#navToggle').tap();
  await p.waitForTimeout(400);
  const menuOpen = await p.evaluate(() => {
    const l = document.getElementById('navLinks');
    return { open: l.classList.contains('open'), display: getComputedStyle(l).display, links: l.querySelectorAll('a').length };
  });
  await p.screenshot({ path: 'gui-test-screenshots/m2_menu.png', timeout: 90000 });
  // 点一个链接 → 应关闭并跳转
  await p.locator('#navLinks a[href="#shooting"]').tap();
  await p.waitForTimeout(1200);
  const afterNav = await p.evaluate(() => ({
    closed: !document.getElementById('navLinks').classList.contains('open'),
    scrolled: window.scrollY > 100,
  }));
  console.log(`${toggleVisible && menuOpen.open && menuOpen.links === 5 ? '✅' : '❌'} 汉堡菜单展开（5 链接）`);
  console.log(`${afterNav.closed && afterNav.scrolled ? '✅' : '❌'} 点链接后关闭并跳转`);

  // 2. 触控目标复检
  const small = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll('button, a, input[type=range], .check-list li, .chip').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.height < 32 && !el.closest('.ticker-track')) {
        out.push(`${el.tagName}.${(el.className || '').toString().split(' ')[0]} h=${Math.round(r.height)}`);
      }
    });
    return [...new Set(out)].slice(0, 10);
  });
  console.log(`${small.length === 0 ? '✅' : '❌'} 触控目标 ≥32px`, small.length ? small.join(', ') : '');

  // 3. 工坊核心交互（触屏）
  await p.evaluate(() => document.getElementById('studio').scrollIntoView());
  await p.waitForTimeout(600);
  await p.locator('.src-tab[data-src="sample"]').tap();
  await p.locator('.sample-card[data-sample="mushroom"]').tap({ timeout: 120000 });
  await p.waitForFunction(() => {
    const el = document.getElementById('statBeads');
    return el && el.textContent !== '—' && /\d/.test(el.textContent);
  }, { timeout: 300000 }).catch(() => {});
  await p.waitForTimeout(2500);
  const s = await p.evaluate(() => ({
    beads: document.getElementById('statBeads').textContent,
    tools: getComputedStyle(document.querySelector('.tool[data-mode="bead"]')).minHeight,
    sliderH: Math.round(document.getElementById('rngGrid').getBoundingClientRect().height),
  }));
  console.log(`${/\d/.test(s.beads) && s.beads !== '—' ? '✅' : '❌'} 触屏拼豆（豆=${s.beads}，工具按钮 minH=${s.tools}，滑块高=${s.sliderH}px）`);
  await p.screenshot({ path: 'gui-test-screenshots/m2_studio.png', timeout: 90000 });

  // 4. 逐颗模式触屏放置
  await p.locator('.tool[data-mode="bead"]').tap({ timeout: 60000 });
  await p.waitForTimeout(500);
  for (let i = 0; i < 3; i++) {
    await p.locator('#stageCanvas').tap({ position: { x: 195, y: 195 }, timeout: 30000 }).catch(() => {});
    await p.waitForTimeout(200);
  }
  const hud = await p.evaluate(() => document.getElementById('hudCount').textContent);
  console.log(`${!hud.startsWith('0 /') ? '✅' : '❌'} 触屏逐颗放置（${hud}）`);
  await p.screenshot({ path: 'gui-test-screenshots/m2_bead.png', timeout: 90000 });

  // 5. 全节截图
  for (const id of ['hero', 'why', 'ai']) {
    await p.evaluate((s) => document.getElementById(s).scrollIntoView(), id);
    await p.waitForTimeout(600);
    await p.screenshot({ path: `gui-test-screenshots/m2_${id}.png`, timeout: 90000 });
  }
} finally { await b.close(); }
console.log('错误:', issues.length ? issues.join('\n') : '（无）');

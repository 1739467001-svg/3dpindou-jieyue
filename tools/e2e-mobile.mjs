// 手机端审计：溢出检测 + 分节截图 + 触控目标检查
import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--no-sandbox'] });
const issues = [];
try {
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  p.on('pageerror', e => issues.push('PAGEERROR: ' + e.message.slice(0, 150)));
  await p.goto('http://localhost:8080', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await p.waitForTimeout(2500);

  // 1. 全页水平溢出检测
  const overflow = await p.evaluate(() => {
    const out = [];
    const vw = document.documentElement.clientWidth;
    document.querySelectorAll('body *').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > vw + 2 || r.left < -2)) {
        const tag = el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : '');
        if (!el.closest('.ticker-track') && !el.closest('.pipeline')) out.push(`${tag} right=${Math.round(r.right)} vw=${vw}`);
      }
    });
    return [...new Set(out)].slice(0, 15);
  });
  console.log('水平溢出元素:', overflow.length ? '\n - ' + overflow.join('\n - ') : '无');
  const docOverflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log('文档级横向滚动:', docOverflow, 'px');

  // 2. 分节截图
  const secs = ['hero', 'why', 'studio', 'shooting', 'ai', 'tech'];
  for (const id of secs) {
    await p.evaluate((s) => document.getElementById(s).scrollIntoView(), id);
    await p.waitForTimeout(700);
    await p.screenshot({ path: `gui-test-screenshots/m_${id}.png`, timeout: 90000 });
  }

  // 3. 触控目标检查（< 40px 高的可点元素）
  const smallTargets = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll('button, a, input[type=range], .check-list li').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.height < 32) {
        out.push(`${el.tagName}.${(el.className || '').toString().split(' ')[0]} h=${Math.round(r.height)} "${(el.textContent || '').trim().slice(0, 10)}"`);
      }
    });
    return [...new Set(out)].slice(0, 12);
  });
  console.log('过小触控目标:', smallTargets.length ? '\n - ' + smallTargets.join('\n - ') : '无');

  // 4. 导航可用性（手机端导航链接被隐藏）
  const navState = await p.evaluate(() => ({
    linksVisible: getComputedStyle(document.querySelector('.nav-links')).display,
    navHeight: Math.round(document.querySelector('.site-nav').getBoundingClientRect().height),
  }));
  console.log('手机端导航:', JSON.stringify(navState));
} finally { await b.close(); }
console.log('错误:', issues.length ? issues.join('\n') : '（无）');

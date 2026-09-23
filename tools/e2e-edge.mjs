// 边界路径测试：360视频抽帧 / 色板CSV导入 / 设置弹窗 / 快捷提问
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const errors = [];
const R = [];
const log = (n, p, d = '') => { R.push([n, p]); console.log(`${p ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`); };

const browser = await chromium.launch({
  channel: 'chrome', headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 680 } });
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message.slice(0, 200)));
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url().slice(0, 100)); });

  await page.goto('http://localhost:8080', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(2500);

  // ---- 1. 页面内生成一段 webm 视频（模拟用户拍摄的 360 视频）----
  const b64 = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let attempt = 0; attempt < 3; attempt++) {
      const c = document.createElement('canvas');
      c.width = 640; c.height = 320;
      const ctx = c.getContext('2d');
      // captureStream(0) + requestFrame：手动逐帧抓取，不依赖 rAF/定时器节流
      const stream = c.captureStream(0);
      const track = stream.getVideoTracks()[0];
      const rec = new MediaRecorder(stream, { mimeType: 'video/webm', videoBitsPerSecond: 2000000 });
      const chunks = [];
      rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      rec.start(300);
      const draw = (t) => {
        const g = ctx.createLinearGradient(0, 0, 0, 320);
        g.addColorStop(0, '#7ab5de'); g.addColorStop(0.55, '#a8c89a'); g.addColorStop(0.56, '#5c8a4a'); g.addColorStop(1, '#3c6b2e');
        ctx.fillStyle = g; ctx.fillRect(0, 0, 640, 320);
        ctx.fillStyle = '#d84a30';
        ctx.beginPath(); ctx.arc(320 + Math.sin(t * 2) * 60, 150, 55, 0, 7); ctx.fill();
        ctx.fillStyle = '#f2e8c9';
        ctx.fillRect(250, 205, 140, 90);
      };
      for (let i = 0; i < 45; i++) {
        draw(i / 45 * 3);
        track.requestFrame();
        await sleep(30);
      }
      rec.stop();
      await new Promise(res => { rec.onstop = res; });
      const blob = new Blob(chunks, { type: 'video/webm' });
      if (blob.size >= 2000) {
        const buf = await blob.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let s = '';
        for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192));
        return btoa(s);
      }
    }
    throw new Error('视频录制重试 3 次均为空');
  });
  writeFileSync('/tmp/test-360.webm', Buffer.from(b64, 'base64'));
  log('生成测试视频', b64.length > 1500, `${(b64.length / 1024).toFixed(0)}KB webm`);

  // ---- 2. 上传视频 → 抽帧 ----
  await page.locator('.nav-links a[href="#studio"]').click({ timeout: 120000, noWaitAfter: true });
  await page.waitForTimeout(1500); // 等 smooth scroll 结束
  await page.locator('.src-tab[data-src="video"]').click({ timeout: 120000, noWaitAfter: true });
  await page.locator('#fileVideo').setInputFiles('/tmp/test-360.webm', { timeout: 60000 });
  await page.waitForFunction(() => !document.getElementById('frameStrip').hidden, { timeout: 60000 }).catch(() => {});
  const frames = await page.evaluate(() => document.querySelectorAll('.frame-thumb').length);
  log('视频抽帧（8 帧）', frames === 8, `${frames} 帧`);

  // ---- 3. 点某一帧 → 构建 ----
  if (frames === 8) {
    await page.locator('.frame-thumb').nth(3).click({ timeout: 120000, noWaitAfter: true });
    await page.waitForFunction((prev) => {
      const el = document.getElementById('statBeads');
      return el && el.textContent !== '—' && /\d/.test(el.textContent);
    }, { timeout: 300000 }).catch(() => {});
    const s = await page.evaluate(() => ({
      beads: document.getElementById('statBeads').textContent,
      layers: document.getElementById('statLayers').textContent,
      toast: [...document.querySelectorAll('.toast')].map(t => t.textContent).join('|').slice(0, 100),
    }));
    log('视频帧 → 拼豆', /\d/.test(s.beads) && s.beads !== '—', `豆=${s.beads} 层=${s.layers}`);
    if (s.toast.includes('失败') || s.toast.includes('太少')) console.log('   toast:', s.toast);
  }

  // ---- 4. 色板 CSV 导入 ----
  writeFileSync('/tmp/my-palette.csv', 'code,hex,name\nP1,#ff0000,大红\nP2,#00ff00,草绿\nP3,#0000ff,宝蓝\nP4,#ffff00,明黄\n');
  await page.locator('#btnImportPalette').click({ timeout: 120000, noWaitAfter: true });
  // file chooser：Playwright 需要 filechooser 事件
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 30000 }),
    page.locator('#btnImportPalette').click({ timeout: 120000, noWaitAfter: true }).catch(() => {}),
  ]);
  await chooser.setFiles('/tmp/my-palette.csv');
  await page.waitForTimeout(800);
  const palState = await page.evaluate(() => ({
    val: document.getElementById('valPalette').textContent,
    sel: document.getElementById('selPalette').value,
    toast: [...document.querySelectorAll('.toast')].map(t => t.textContent).join('|').slice(0, 60),
  }));
  log('色板 CSV 导入', palState.sel === 'custom' && palState.val.includes('4'), `${palState.val} | ${palState.toast}`);

  // ---- 5. 设置弹窗 ----
  await page.locator('#fabAssistant').click({ timeout: 120000, noWaitAfter: true });
  await page.locator('#btnAssistantSettings').click({ timeout: 120000, noWaitAfter: true });
  await page.waitForTimeout(400);
  const modalVisible = await page.evaluate(() => !document.getElementById('settingsModal').hidden);
  await page.locator('#btnSaveSettings').click({ timeout: 120000, noWaitAfter: true });
  const modalHidden = await page.evaluate(() => document.getElementById('settingsModal').hidden);
  const mode = await page.evaluate(() => document.getElementById('assistantMode').textContent);
  log('设置弹窗开关', modalVisible && modalHidden, mode);

  // ---- 6. 快捷提问 ----
  const chips = await page.locator('#assistantChips .chip').count();
  if (chips > 0) {
    await page.locator('#assistantChips .chip').first().click({ timeout: 120000, noWaitAfter: true });
    await page.waitForTimeout(1500);
    const reply = await page.evaluate(() => {
      const m = [...document.querySelectorAll('.msg.bot')];
      return m.length ? m[m.length - 1].textContent : '';
    });
    log('快捷提问回答', reply.length > 20, reply.slice(0, 30) + '…');
  }
} finally {
  await browser.close();
}

console.log('\n===== 控制台错误 =====');
console.log(errors.length ? errors.slice(0, 10).join('\n') : '（无）');
const failed = R.filter(r => !r[1]).length;
console.log(`\n===== ${R.length - failed}/${R.length} 通过 =====`);
process.exit(failed ? 1 : 0);

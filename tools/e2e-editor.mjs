// 编辑器平台实测：新建空白 → 摆豆 → 图层 → 熨烫 → AI 桥接 → 导出
import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--no-sandbox'] });
const errors = [];
const R = [];
const log = (n, p, d = '') => { R.push([n, p]); console.log(`${p ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`); };
try {
  const p = await b.newPage({ viewport: { width: 1280, height: 860 } });
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  p.on('pageerror', e => errors.push('PAGEERROR: ' + e.message.slice(0, 250)));
  p.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url().slice(0, 90)); });
  await p.goto('http://localhost:8080', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await p.waitForTimeout(2500);

  // 1. 切到「新建空白」并创建作品
  await p.locator('.nav-links a[href="#studio"]').click({ timeout: 120000, noWaitAfter: true });
  await p.waitForTimeout(1200);
  await p.locator('.src-tab[data-mode="new"]').click({ timeout: 60000, noWaitAfter: true });
  await p.waitForTimeout(400);
  const brandCount = await p.evaluate(() => document.getElementById('selBrand').options.length);
  log('品牌色板下拉（7 个真实品牌）', brandCount === 7, `${brandCount} 个`);
  await p.locator('#btnCreateProject').click({ timeout: 60000, noWaitAfter: true });
  await p.waitForTimeout(1200);
  const ui = await p.evaluate(() => ({
    toolbar: !document.getElementById('editorToolbar').hidden,
    board: !document.getElementById('boardWrap').hidden,
    iron: !document.getElementById('ironPanel').hidden,
    palColors: document.querySelectorAll('#palGrid i').length,
    layers: document.getElementById('layerTotal').textContent,
  }));
  log('创建空白作品进入编辑器', ui.toolbar && ui.board && ui.iron && ui.palColors > 100,
    `工具栏/钉板/熨烫可见，色板 ${ui.palColors} 色，${ui.layers} 层`);

  // 2. 在钉板上画一笔（拖拽笔刷）
  const box = await p.locator('#boardCanvas').boundingBox();
  await p.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.35);
  await p.mouse.down();
  await p.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.45, { steps: 12 });
  await p.mouse.up();
  await p.waitForTimeout(500);
  const afterPaint = await p.evaluate(() => ({
    beads: document.getElementById('statBeads').textContent,
    hud: document.getElementById('hudCount').textContent,
  }));
  log('2D 钉板摆豆（拖拽笔刷）', afterPaint.beads !== '—' && afterPaint.beads !== '0', `豆=${afterPaint.beads}`);

  // 3. 撤销/重做
  await p.locator('#btnUndo').click({ timeout: 30000, noWaitAfter: true });
  await p.waitForTimeout(300);
  const afterUndo = await p.evaluate(() => document.getElementById('statBeads').textContent);
  await p.locator('#btnRedo').click({ timeout: 30000, noWaitAfter: true });
  await p.waitForTimeout(300);
  const afterRedo = await p.evaluate(() => document.getElementById('statBeads').textContent);
  log('撤销/重做', afterRedo !== afterUndo, `撤销后=${afterUndo} 重做后=${afterRedo}`);

  // 4. 新增层 + 复制层
  await p.locator('#btnAddLayer').click({ timeout: 30000, noWaitAfter: true });
  await p.waitForTimeout(300);
  await p.locator('#btnDupLayer').click({ timeout: 30000, noWaitAfter: true });
  await p.waitForTimeout(400);
  const layers = await p.evaluate(() => document.getElementById('layerTotal').textContent);
  log('新增/复制图层', layers === '10', `共 ${layers} 层`);

  // 5. 镜像工具
  await p.locator('#btnMirrorX').click({ timeout: 30000, noWaitAfter: true });
  await p.waitForTimeout(200);
  const mirrorOn = await p.evaluate(() => document.getElementById('btnMirrorX').classList.contains('warn-on'));
  log('镜像工具', mirrorOn);
  await p.locator('#btnMirrorX').click({ timeout: 30000, noWaitAfter: true });

  // 6. 熨烫模拟
  await p.locator('#btnIronLayer').click({ timeout: 60000, noWaitAfter: true });
  await p.waitForTimeout(600);
  const iron = await p.evaluate(() => ({
    level: document.getElementById('valIronLevel').textContent,
    live: document.getElementById('ironLive').textContent.slice(0, 40),
  }));
  log('熨烫当前层', iron.level === '标准熨' || iron.level === '轻熨', `${iron.level} | ${iron.live}`);
  // 过热警示
  await p.evaluate(() => { const r = document.getElementById('rngTemp'); r.value = 195; r.dispatchEvent(new Event('input')); });
  await p.waitForTimeout(300);
  const over = await p.evaluate(() => document.getElementById('ironLive').textContent);
  log('过热警示', over.includes('过高'), over.slice(0, 50));
  await p.screenshot({ path: 'gui-test-screenshots/e1_editor.png', timeout: 90000 });
  await p.screenshot({ path: 'gui-test-screenshots/e2_iron.png', timeout: 90000 });

  // 7. 导出
  const dlP = p.waitForEvent('download', { timeout: 60000 });
  await p.locator('#btnExportCsv').click({ timeout: 60000, noWaitAfter: true });
  const dl = await dlP.catch(() => null);
  log('编辑器导出 CSV', !!dl, dl?.suggestedFilename() || '');

  // 8. AI 桥接（先生成一个 AI 作品）
  await p.evaluate(() => document.getElementById('studio').scrollIntoView());
  await p.locator('.src-tab[data-mode="ai"]').click({ timeout: 60000, noWaitAfter: true });
  await p.waitForTimeout(600);
  await p.locator('.src-tab[data-src="sample"]').click({ timeout: 60000, noWaitAfter: true });
  await p.locator('.sample-card[data-sample="mushroom"]').click({ timeout: 120000, noWaitAfter: true });
  // 等 AI 构建真正完成（精修按钮可见），不能用陈旧统计值判断
  await p.waitForFunction(() => !document.getElementById('btnEditProject').hidden, { timeout: 300000 }).catch(() => {});
  await p.waitForTimeout(1500);
  const bridgeVisible = await p.evaluate(() => !document.getElementById('btnEditProject').hidden);
  await p.locator('#btnEditProject').click({ timeout: 60000, noWaitAfter: true });
  await p.waitForTimeout(1500);
  const bridged = await p.evaluate(() => ({
    editing: !document.getElementById('boardWrap').hidden,
    beads: document.getElementById('statBeads').textContent,
    layers: document.getElementById('layerTotal').textContent,
  }));
  log('AI 作品 → 编辑器精修', bridgeVisible && bridged.editing && /\d/.test(bridged.beads),
    `${bridged.beads} 豆 / ${bridged.layers} 层`);
  await p.screenshot({ path: 'gui-test-screenshots/e3_bridge.png', timeout: 90000 });
} finally { await b.close(); }
console.log('\n错误:', errors.length ? errors.slice(0, 8).join('\n') : '（无）');
const failed = R.filter(r => !r[1]).length;
console.log(`===== ${R.length - failed}/${R.length} 通过 =====`);
process.exit(failed ? 1 : 0);

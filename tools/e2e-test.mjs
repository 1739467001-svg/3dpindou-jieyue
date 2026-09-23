// BeadOrbit 全流程自动化实测（Playwright + 系统 Chrome）
// 覆盖：页面加载 → 示例场景 → AI 流水线 → 3D 舞台 → 模式切换 → 导出 → 助手
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = 'http://localhost:8080';
const SHOTS = 'gui-test-screenshots';
mkdirSync(SHOTS, { recursive: true });

const errors = [];
const results = [];
const log = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
};

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: [
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--disable-gpu-sandbox',
    '--no-sandbox',
  ],
});
const page = await browser.newPage({ viewport: { width: 960, height: 680 } });

page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`[console] ${msg.text()}`);
});
page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`));
page.on('requestfailed', (req) => errors.push(`[reqfail] ${req.url()} ${req.failure()?.errorText || ''}`));

// ---------- 1. 页面加载 ----------
await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${SHOTS}/t1_hero.png`, timeout: 60000 });
const title = await page.title();
log('页面加载', title.includes('BeadOrbit'), title);
const heroCanvasOk = await page.evaluate(() => {
  const c = document.getElementById('heroCanvas');
  return c && c.width > 0 && c.height > 0;
});
log('Hero 拼豆球 canvas', heroCanvasOk);

// 检查模块加载错误（three / ort / main）
const importErrors = errors.filter(e => e.includes('three') || e.includes('ort') || e.includes('import'));
log('模块加载无错误', importErrors.length === 0, importErrors.slice(0, 2).join(' | '));

// ---------- 2. 点击示例场景 ----------
await page.locator('.nav-links a[href="#studio"]').click({ timeout: 150000 });
await page.waitForTimeout(800);
await page.locator('.src-tab[data-src="sample"]').click({ timeout: 150000 });
await page.locator('.sample-card[data-sample="mushroom"]').click({ timeout: 150000 });
// 流水线：等统计面板出现豆子数（最多 90 秒，WASM 推理 + 光追）
await page.waitForFunction(
  () => {
    const el = document.getElementById('statBeads');
    return el && el.textContent !== '—' && /\d/.test(el.textContent);
  },
  { timeout: 120000 }
).catch(() => {});
await page.waitForTimeout(1200);
await page.screenshot({ path: `${SHOTS}/t2_studio_build.png`, timeout: 60000 });

const stats = await page.evaluate(() => ({
  beads: document.getElementById('statBeads').textContent,
  colors: document.getElementById('statColors').textContent,
  layers: document.getElementById('statLayers').textContent,
  size: document.getElementById('statSize').textContent,
  hud: document.getElementById('hudCount').textContent,
}));
log('AI 流水线产出拼豆模型', /\d/.test(stats.beads) && stats.beads !== '—',
  `豆数=${stats.beads} 色=${stats.colors} 层=${stats.layers} 尺寸=${stats.size} HUD=${stats.hud}`);

// 流水线步骤状态
const pipeDone = await page.evaluate(() =>
  [...document.querySelectorAll('.pipe-step.done')].length
);
log('流水线 5 步全部完成', pipeDone === 5, `done=${pipeDone}/5`);

// ---------- 3. 逐层建造动画 → 完成后切逐颗 ----------
await page.waitForTimeout(3500);
await page.screenshot({ path: `${SHOTS}/t3_layer_build.png`, timeout: 60000 });
await page.locator('.tool[data-mode="bead"]').click({ timeout: 150000 });
await page.waitForTimeout(600);
const ghostVisible = await page.evaluate(() => {
  // 通过 HUD 文本判断逐颗模式
  return document.getElementById('hudMode').textContent;
});
log('切换到逐颗拼装模式', ghostVisible.includes('逐颗'), ghostVisible);

// 点击画布放 5 颗豆
for (let i = 0; i < 5; i++) {
  await page.locator('#stageCanvas').click({ position: { x: 300, y: 220 }, timeout: 60000 });
  await page.waitForTimeout(180);
}
const hudAfter = await page.evaluate(() => document.getElementById('hudCount').textContent);
log('逐颗放置生效', !hudAfter.startsWith('0 /'), hudAfter);
await page.screenshot({ path: `${SHOTS}/t4_bead_mode.png`, timeout: 60000 });

// ---------- 4. 观察模式 + 自转 ----------
await page.locator('.tool[data-mode="orbit"]').click({ timeout: 150000 });
await page.waitForTimeout(400);
await page.locator('#btnSpin').click({ timeout: 150000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${SHOTS}/t5_orbit_spin.png`, timeout: 60000 });
const spinOn = await page.evaluate(() => document.getElementById('btnSpin').classList.contains('active'));
log('自转开启', spinOn);
await page.locator('#btnSpin').click({ timeout: 150000 });

// ---------- 5. 导出（下载事件） ----------
const dl1 = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
await page.locator('#btnExportCsv').click({ timeout: 150000 });
const d1 = await dl1;
log('导出材料清单 CSV', !!d1, d1 ? d1.suggestedFilename() : '无下载事件');

const dl2 = page.waitForEvent('download', { timeout: 20000 }).catch(() => null);
await page.locator('#btnExportPng').click({ timeout: 150000 });
const d2 = await dl2;
log('导出分层图纸 PNG', !!d2, d2 ? d2.suggestedFilename() : '无下载事件');

// ---------- 6. AI 助手 ----------
await page.locator('#fabAssistant').click({ timeout: 150000 });
await page.waitForTimeout(400);
await page.locator('#assistantText').fill('怎么用 X5 拍出能拼的素材？');
await page.locator('#assistantForm button[type="submit"]').click({ timeout: 150000 });
await page.waitForTimeout(1200);
const assistantReply = await page.evaluate(() => {
  const msgs = [...document.querySelectorAll('.msg.bot')];
  return msgs.length ? msgs[msgs.length - 1].textContent : '';
});
log('AI 助手回答', assistantReply.length > 20, assistantReply.slice(0, 40) + '…');
await page.screenshot({ path: `${SHOTS}/t6_assistant.png`, timeout: 60000 });

// ---------- 7. 拍摄指南 ----------
await page.locator('#fabAssistant').click({ timeout: 150000 }); // 关闭助手
await page.evaluate(() => document.getElementById('shooting').scrollIntoView());
await page.waitForTimeout(800);
const checkItems = await page.locator('#checkList li').count();
await page.locator('#checkList li').nth(0).click({ timeout: 150000 });
await page.locator('#checkList li').nth(1).click({ timeout: 150000 });
const score = await page.evaluate(() => document.getElementById('checkScore').textContent);
log('拍摄自检清单计分', checkItems === 12 && score !== '0 / 100', `项目=${checkItems} 得分=${score}`);
await page.screenshot({ path: `${SHOTS}/t7_shooting.png`, timeout: 60000 });

// ---------- 8. 文字生成 ----------
await page.evaluate(() => document.getElementById('studio').scrollIntoView());
await page.waitForTimeout(500);
await page.locator('.src-tab[data-src="text"]').click({ timeout: 150000 });
await page.locator('#textPrompt').fill('一座云雾中的城堡');
await page.locator('#btnTextGen').click({ timeout: 150000 });
await page.waitForFunction(
  () => {
    const el = document.getElementById('statBeads');
    return el && el.textContent !== '—' && /\d/.test(el.textContent);
  },
  { timeout: 120000 }
).catch(() => {});
await page.waitForTimeout(1000);
const stats2 = await page.evaluate(() => ({
  beads: document.getElementById('statBeads').textContent,
  layers: document.getElementById('statLayers').textContent,
}));
log('文字生成 → 拼豆', /\d/.test(stats2.beads) && stats2.beads !== '—', `豆数=${stats2.beads} 层=${stats2.layers}`);
await page.screenshot({ path: `${SHOTS}/t8_textgen.png`, timeout: 60000 });

// ---------- 汇总 ----------
console.log('\n===== 控制台错误 =====');
if (errors.length === 0) console.log('（无）');
else errors.slice(0, 20).forEach(e => console.log(e));

const failed = results.filter(r => !r.pass);
console.log(`\n===== 结果：${results.length - failed.length}/${results.length} 通过 =====`);
await browser.close();
process.exit(failed.length ? 1 : 0);

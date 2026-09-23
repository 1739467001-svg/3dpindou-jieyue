// ============================================================
// BeadOrbit 路演 PPT 构建脚本（pptxgenjs）
// 设计：工坊纸本风 —— 米色纸面 + 油墨黑 + 珊瑚红/teal/芥末黄
// 结构：深色封面/结尾（三明治），浅色内容页；花案 = 豆子圆点
// ============================================================
const pptxgen = require('pptxgenjs');
const path = require('path');

const SHOTS = path.join(__dirname, '..', 'gui-test-screenshots');

// ---------- 调色板（全 deck 只用这套常量） ----------
const BG = 'F6F0E3';       // 纸面
const INK = '211B14';      // 油墨
const CORAL = 'DD4B26';    // 主色（豆子红）
const TEAL = '0E8F86';     // 次色（豆子青）
const MUSTARD = 'E6A23C';  // 强调（最重点）
const MUTED = '7D7263';    // 弱文字
const PAPER2 = 'EFE6D3';   // 纸面深一档

const CJK = 'Microsoft YaHei';
const NUM = 'Georgia';

const W = 13.33, H = 7.5, M = 0.55;

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE';
pres.author = 'BeadOrbit 团队';
pres.title = 'BeadOrbit · 360°立体拼豆工坊';

// ---------- 工具 ----------
// 豆子圆点（花案）：实心圆 + 中心小孔
function bead(slide, x, y, d, color, holeColor) {
  slide.addShape(pres.shapes.OVAL, {
    x, y, w: d, h: d,
    fill: { color }, line: { color: INK, width: 1 },
  });
  const hd = d * 0.32;
  slide.addShape(pres.shapes.OVAL, {
    x: x + (d - hd) / 2, y: y + (d - hd) / 2, w: hd, h: hd,
    fill: { color: holeColor || '1A140E' }, line: { type: 'none' },
  });
}
// 页脚（赛道信息 + 页码）
function footer(slide, n, total) {
  slide.addText('2026 影石 Insta360 Bold Maker 智能影像挑战赛 · AI+影像产品开发', {
    x: M, y: H - 0.42, w: 8, h: 0.3, margin: 0,
    fontFace: CJK, fontSize: 10.5, color: MUTED, align: 'left',
  });
  slide.addText(`${n} / ${total}`, {
    x: W - M - 1, y: H - 0.42, w: 1, h: 0.3, margin: 0,
    fontFace: NUM, fontSize: 10.5, color: MUTED, align: 'right',
  });
}
// 内容页标题（左上，无下划线）
function head(slide, kicker, title) {
  slide.addText(kicker, {
    x: M, y: 0.42, w: 9, h: 0.3, margin: 0,
    fontFace: CJK, fontSize: 12, bold: true, color: CORAL, charSpacing: 2,
  });
  slide.addText(title, {
    x: M, y: 0.72, w: 11.5, h: 0.62, margin: 0,
    fontFace: CJK, fontSize: 30, bold: true, color: INK,
  });
}

const TOTAL = 9;

// ============================================================
// 1. 封面（深色）
// ============================================================
{
  const s = pres.addSlide();
  s.background = { color: INK };
  // 右侧产品截图（有界区域，不铺满）
  s.addImage({
    path: path.join(SHOTS, 'c5_orbit.png'),
    x: 7.15, y: 1.45, w: 5.6, h: 4.2,
    sizing: { type: 'cover', w: 5.6, h: 4.2 },
    line: { color: '4A3F33', width: 1.5 },
  });
  s.addText('360° 全景 → AI → 立体拼豆 · 全流程 7 秒', {
    x: 7.15, y: 5.75, w: 5.6, h: 0.3, margin: 0,
    fontFace: CJK, fontSize: 12, color: 'B7AC98', align: 'center',
  });
  // 左侧标题
  s.addText('AI+影像产品开发赛道', {
    x: M, y: 0.85, w: 6.2, h: 0.32, margin: 0,
    fontFace: CJK, fontSize: 13, bold: true, color: MUSTARD, charSpacing: 3,
  });
  s.addText([
    { text: '把世界，拼成', options: { breakLine: true } },
    { text: '一颗颗豆子。', options: { color: CORAL } },
  ], {
    x: M, y: 1.35, w: 6.4, h: 2.3, margin: 0,
    fontFace: CJK, fontSize: 46, bold: true, color: BG, lineSpacingMultiple: 1.12,
  });
  s.addText('BeadOrbit · 360°立体拼豆工坊', {
    x: M, y: 3.75, w: 6.4, h: 0.45, margin: 0,
    fontFace: NUM, fontSize: 21, bold: true, color: TEAL,
  });
  s.addText('用影石全景相机拍下任何事物，AI 在浏览器里把它变成可以 360° 旋转、逐颗拼装的立体拼豆作品——并直接给出分层施工图纸与材料清单。', {
    x: M, y: 4.3, w: 6.1, h: 1.3, margin: 0,
    fontFace: CJK, fontSize: 15, color: 'CFC4B0', lineSpacingMultiple: 1.35,
  });
  // 豆子圆点花案
  const beadColors = [CORAL, MUSTARD, TEAL, '3F7FBF', '8E5AC8'];
  beadColors.forEach((c, i) => bead(s, M + i * 0.62, 5.95, 0.42, c));
  s.addText('拼豆 · 全景 · AI · 三维重建 · 手作', {
    x: M + 3.3, y: 6.0, w: 4, h: 0.32, margin: 0,
    fontFace: CJK, fontSize: 12.5, color: '8D8172',
  });
}

// ============================================================
// 2. 痛点（浅色 · 大数字）
// ============================================================
{
  const s = pres.addSlide();
  s.background = { color: BG };
  head(s, 'STEP 00 · 调研发现', '拼豆很火，但图纸停在平面');
  // 三个大数字
  const stats = [
    ['70亿+', '小红书拼豆话题浏览量', CORAL],
    ['+9018%', '抖音拼豆订单同比增长', TEAL],
    ['0 个', '支持 3D 图纸的现有工具', MUSTARD],
  ];
  stats.forEach(([num, label, color], i) => {
    const x = M + i * 4.05;
    s.addText(num, {
      x, y: 1.75, w: 3.8, h: 1.15, margin: 0,
      fontFace: NUM, fontSize: 58, bold: true, color,
    });
    s.addText(label, {
      x, y: 2.95, w: 3.8, h: 0.35, margin: 0,
      fontFace: CJK, fontSize: 14.5, color: INK, bold: true,
    });
  });
  // 三条发现（行式列表，无容器）
  const findings = [
    ['工具断层', '国内外十余个拼豆图纸生成器（pindouai、bitbead、perler-beads.org…）全部只输出 2D 平面网格图。'],
    ['立体靠手搓', '想拼立体作品只能 MagicaVoxel 手工建模、拆层、手动画每层图纸——一个 6 面板小房子画图 4–6 小时。'],
    ['痛点明确', '拼之前用户最需要三样：带色号的施工图、材料清单 BOM、色号对得上自己手里的豆子。'],
  ];
  findings.forEach(([lead, desc], i) => {
    const y = 3.75 + i * 0.92;
    bead(s, M, y + 0.06, 0.3, [CORAL, TEAL, MUSTARD][i]);
    s.addText(lead, {
      x: M + 0.5, y, w: 2.2, h: 0.4, margin: 0,
      fontFace: CJK, fontSize: 16, bold: true, color: INK,
    });
    s.addText(desc, {
      x: M + 2.75, y: y - 0.02, w: 9.4, h: 0.75, margin: 0,
      fontFace: CJK, fontSize: 13.5, color: '4B4335', lineSpacingMultiple: 1.25,
    });
  });
  s.addText('市场空白：把 360° 全景自动转成「可拼的立体图纸」——没有任何工具在做。', {
    x: M, y: 6.55, w: 12.2, h: 0.4, margin: 0,
    fontFace: CJK, fontSize: 15, bold: true, color: CORAL,
  });
  footer(s, 2, TOTAL);
}

// ============================================================
// 3. 方案：五步流水线（浅色 · 步骤图）
// ============================================================
{
  const s = pres.addSlide();
  s.background = { color: BG };
  head(s, 'STEP 01 · 产品方案', '一张全景图，七秒变成立体拼豆');
  const steps = [
    ['全景素材', '影石 X5 拍摄 / 360 视频 / 文字造景'],
    ['AI 深度估计', 'Depth Anything V2 跑在浏览器里'],
    ['球面反投影', 'ERP→方向×深度→点云（DAP 同款）'],
    ['体素化降噪', '48³ 网格 · 孤立体素剔除'],
    ['拼豆量化', 'CIEDE2000 匹配品牌色板'],
  ];
  const cw = 2.28, gap = 0.19;
  steps.forEach(([t, d], i) => {
    const x = M + i * (cw + gap);
    // 步骤卡：纸面深一档 + 投影（不用边缘色条）
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: 1.85, w: cw, h: 2.5,
      fill: { color: PAPER2 }, line: { color: INK, width: 1.25 },
      shadow: { type: 'outer', color: '211B14', blur: 5, offset: 3, angle: 45, opacity: 0.18 },
    });
    bead(s, x + 0.22, 2.05, 0.52, [CORAL, MUSTARD, TEAL, CORAL, TEAL][i]);
    s.addText(`0${i + 1}`, {
      x: x + 0.85, y: 2.08, w: 1.2, h: 0.45, margin: 0,
      fontFace: NUM, fontSize: 20, bold: true, color: INK,
    });
    s.addText(t, {
      x: x + 0.22, y: 2.75, w: cw - 0.44, h: 0.42, margin: 0,
      fontFace: CJK, fontSize: 16.5, bold: true, color: INK,
    });
    s.addText(d, {
      x: x + 0.22, y: 3.22, w: cw - 0.4, h: 1.0, margin: 0,
      fontFace: CJK, fontSize: 12, color: MUTED, lineSpacingMultiple: 1.3,
    });
    if (i < 4) {
      s.addText('→', {
        x: x + cw - 0.02, y: 2.85, w: 0.3, h: 0.4, margin: 0,
        fontFace: NUM, fontSize: 18, bold: true, color: MUTED, align: 'center',
      });
    }
  });
  // 产出条
  s.addShape(pres.shapes.RECTANGLE, {
    x: M, y: 4.75, w: 12.23, h: 1.55,
    fill: { color: INK },
  });
  s.addText('直接产出', {
    x: M + 0.35, y: 4.95, w: 2, h: 0.35, margin: 0,
    fontFace: CJK, fontSize: 13, bold: true, color: MUSTARD, charSpacing: 2,
  });
  const outputs = [
    ['360° 可交互 3D 模型', '逐层 / 逐颗拼装'],
    ['分层施工图纸', '每层网格图 + 色号'],
    ['材料清单 BOM', '每种色号多少颗'],
    ['分享卡片', '截图 + 统计 + 色板'],
  ];
  outputs.forEach(([t, d], i) => {
    const x = M + 0.35 + i * 3.0;
    s.addText(t, {
      x, y: 5.35, w: 2.9, h: 0.4, margin: 0,
      fontFace: CJK, fontSize: 15.5, bold: true, color: BG,
    });
    s.addText(d, {
      x, y: 5.78, w: 2.9, h: 0.35, margin: 0,
      fontFace: CJK, fontSize: 12, color: 'B7AC98',
    });
  });
  footer(s, 3, TOTAL);
}

// ============================================================
// 4. Demo 动线（浅色 · 截图 + 数据）
// ============================================================
{
  const s = pres.addSlide();
  s.background = { color: BG };
  head(s, 'STEP 02 · 现场演示', '三分钟动线：拍 → 拼 → 带走');
  // 左：截图
  s.addImage({
    path: path.join(SHOTS, 'c3_build.png'),
    x: M, y: 1.7, w: 6.9, h: 4.35,
    sizing: { type: 'cover', w: 6.9, h: 4.35 },
    line: { color: INK, width: 1.5 },
    shadow: { type: 'outer', color: '211B14', blur: 6, offset: 3, angle: 45, opacity: 0.2 },
  });
  s.addText('工坊实拍：逐层建造中的蘑菇小屋（深色操作台 + 进度 HUD）', {
    x: M, y: 6.12, w: 6.9, h: 0.3, margin: 0,
    fontFace: CJK, fontSize: 11.5, color: MUTED,
  });
  // 右：三步
  const acts = [
    ['拍', '拍摄指南把影石 3DGS 规范变成可执行清单：X5 / 8K30fps / 1–2m / <1m/s / 70–80% 重叠 / 数据闭环，附路径模拟器与 12 项自检打分。', CORAL],
    ['拼', '点「蘑菇小屋」→ AI 深度 → 点云 → 体素 → 色板匹配。观察 / 逐层 / 逐颗三种模式，落豆有音效与弹性动画。', TEAL],
    ['带走', '分层图纸 PNG（格内印色号，打印即拼）、材料清单 CSV（照单买豆）、作品 JSON、分享卡片。', MUSTARD],
  ];
  acts.forEach(([t, d, c], i) => {
    const y = 1.75 + i * 1.52;
    bead(s, 7.75, y + 0.05, 0.56, c);
    s.addText(t, {
      x: 7.75, y: y + 0.12, w: 0.56, h: 0.42, margin: 0,
      fontFace: CJK, fontSize: 17, bold: true, color: BG, align: 'center',
    });
    s.addText(d, {
      x: 8.5, y: y - 0.05, w: 4.25, h: 1.45, margin: 0,
      fontFace: CJK, fontSize: 12.5, color: '4B4335', lineSpacingMultiple: 1.3,
    });
  });
  // 实测数据条
  s.addText([
    { text: '实测：', options: { bold: true, color: INK } },
    { text: '蘑菇小屋 3,470 豆 / 44 层 / 8 色，总耗时 ', options: { color: '4B4335' } },
    { text: '7.0s', options: { bold: true, color: CORAL } },
    { text: '（含 AI 推理）· 机器人 4,230 豆 · 多帧融合 2,763 豆', options: { color: '4B4335' } },
  ], {
    x: 7.75, y: 6.15, w: 5.0, h: 0.8, margin: 0,
    fontFace: CJK, fontSize: 12, lineSpacingMultiple: 1.25,
  });
  footer(s, 4, TOTAL);
}

// ============================================================
// 5. AI 在哪里（浅色 · 行式列表）
// ============================================================
{
  const s = pres.addSlide();
  s.background = { color: BG };
  head(s, 'STEP 03 · AI 应用', '五个环节，都有 AI 在干活');
  s.addText('对应赛题「用 AI 重新定义怎么拍和怎么看」——我们把「怎么拼」也重新定义了。', {
    x: M, y: 1.42, w: 12, h: 0.35, margin: 0,
    fontFace: CJK, fontSize: 13.5, color: MUTED,
  });
  const rows = [
    ['怎么看', 'AI 全景深度估计', 'Depth Anything V2（ONNX Runtime Web，WebGPU/WASM 自动降级），单张平面全景图 → 带深度的球面场景，流程与影石 DAP 同构', CORAL],
    ['怎么拼', '感知色差配色引擎', '每个体素在 CIELAB 空间用 CIEDE2000 匹配拼豆色板，支持导入 MARD / COCO 官方色板，解决「色号对不上手里豆子」', TEAL],
    ['怎么拍', 'AI 摄影教练', '影石 3DGS 拍摄指南结构化：参数卡 + 路径模拟器 + 自检打分；下一步接 Camera SDK 预览流与 IMU 实时提示', MUSTARD],
    ['怎么想', '拼豆 AI 助手', '常驻聊天入口：技巧 / 参数 / 图纸 / 熨烫；离线知识库默认可用，填入百练 Key 即切换千问大模型', '3F7FBF'],
    ['怎么来', '文字造景', '一句描述生成 360° 全景进入流程——DiT360「文字→全景」理念的离线程序化实现，没相机也能玩', '8E5AC8'],
  ];
  rows.forEach(([tag, t, d, c], i) => {
    const y = 1.95 + i * 0.94;
    s.addShape(pres.shapes.RECTANGLE, {
      x: M, y: y + 0.44, w: 12.23, h: 0.012,
      fill: { color: 'D8CDB8' }, line: { type: 'none' },
    });
    bead(s, M + 0.05, y + 0.1, 0.4, c);
    s.addText(tag, {
      x: M + 0.62, y: y + 0.13, w: 1.35, h: 0.36, margin: 0,
      fontFace: CJK, fontSize: 13, bold: true, color: c,
    });
    s.addText(t, {
      x: M + 2.05, y: y + 0.08, w: 3.1, h: 0.42, margin: 0,
      fontFace: CJK, fontSize: 16.5, bold: true, color: INK,
    });
    s.addText(d, {
      x: M + 5.3, y: y + 0.02, w: 7.0, h: 0.85, margin: 0,
      fontFace: CJK, fontSize: 12, color: '4B4335', lineSpacingMultiple: 1.22,
    });
  });
  footer(s, 5, TOTAL);
}

// ============================================================
// 6. 技术架构（浅色 · 链路 + 影石资源）
// ============================================================
{
  const s = pres.addSlide();
  s.background = { color: BG };
  head(s, 'STEP 04 · 技术实现', '一条链路，全部跑在浏览器里');
  // 架构链
  const chain = [
    ['素材输入', '全景图 / 360视频 / 造景'],
    ['AI 深度估计', 'DA-V2 int8 · ORT Web'],
    ['球面反投影', 'ERP→点云'],
    ['体素化', '48³ · 孤立降噪'],
    ['拼豆量化', 'CIEDE2000'],
    ['交互工坊', 'Three.js 三模式'],
  ];
  const cw = 1.87, gap = 0.16;
  chain.forEach(([t, d], i) => {
    const x = M + i * (cw + gap);
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: 1.8, w: cw, h: 1.28,
      fill: { color: i === 1 || i === 4 ? INK : '#FFFFFF' },
      line: { color: INK, width: 1.25 },
    });
    s.addText(t, {
      x: x + 0.1, y: 1.95, w: cw - 0.2, h: 0.38, margin: 0,
      fontFace: CJK, fontSize: 13.5, bold: true,
      color: i === 1 || i === 4 ? BG : INK, align: 'center',
    });
    s.addText(d, {
      x: x + 0.08, y: 2.38, w: cw - 0.16, h: 0.6, margin: 0,
      fontFace: CJK, fontSize: 10.5,
      color: i === 1 || i === 4 ? 'B7AC98' : MUTED, align: 'center', lineSpacingMultiple: 1.2,
    });
    if (i < 5) s.addText('→', {
      x: x + cw - 0.04, y: 2.25, w: 0.26, h: 0.35, margin: 0,
      fontFace: NUM, fontSize: 15, bold: true, color: MUTED, align: 'center',
    });
  });
  // 影石资源对照（两列）
  s.addText('影石资源使用', {
    x: M, y: 3.45, w: 6, h: 0.4, margin: 0,
    fontFace: CJK, fontSize: 17, bold: true, color: INK,
  });
  const res = [
    ['X5 / X 系列素材', '核心输入；.insv 导出指引内置'],
    ['3DGS 拍摄指南', '完整转化为拍摄指南与自检清单'],
    ['DAP 深度估计', '流程同构（ERP→深度→点云）'],
    ['DiT360 全景生成', '理念落地为离线程序化造景'],
    ['Camera/Media SDK、OSC', '路线图：实时拍摄教练、远程采集'],
  ];
  res.forEach(([t, d], i) => {
    const y = 3.95 + i * 0.52;
    bead(s, M + 0.02, y + 0.08, 0.22, TEAL);
    s.addText(t, {
      x: M + 0.4, y, w: 2.9, h: 0.4, margin: 0,
      fontFace: CJK, fontSize: 13.5, bold: true, color: INK,
    });
    s.addText(d, {
      x: M + 3.35, y, w: 3.6, h: 0.4, margin: 0,
      fontFace: CJK, fontSize: 12, color: '4B4335',
    });
  });
  // 右列：工程事实
  s.addText('工程事实', {
    x: 7.4, y: 3.45, w: 5, h: 0.4, margin: 0,
    fontFace: CJK, fontSize: 17, bold: true, color: INK,
  });
  const facts = [
    ['零后端', '纯静态部署，照片不上传，隐私默认安全'],
    ['自动降级', 'WebGPU → WASM 多线程 → 启发式兜底'],
    ['断网可演', '模型与运行时内置 111MB'],
    ['自研几何', '反投影 / 体素化 / 限色量化，48³ 约 2–40ms'],
  ];
  facts.forEach(([t, d], i) => {
    const y = 3.95 + i * 0.52;
    bead(s, 7.42, y + 0.08, 0.22, CORAL);
    s.addText(t, {
      x: 7.8, y, w: 1.9, h: 0.4, margin: 0,
      fontFace: CJK, fontSize: 13.5, bold: true, color: INK,
    });
    s.addText(d, {
      x: 9.7, y, w: 3.1, h: 0.4, margin: 0,
      fontFace: CJK, fontSize: 12, color: '4B4335',
    });
  });
  footer(s, 6, TOTAL);
}

// ============================================================
// 7. 评审维度对照（浅色 · 表格）
// ============================================================
{
  const s = pres.addSlide();
  s.background = { color: BG };
  head(s, 'STEP 05 · 赛题对照', '评审维度 → 我们的实现');
  const tableRows = [
    [
      { text: '评审维度', options: { fill: { color: INK }, color: BG, bold: true, fontFace: CJK } },
      { text: '对应实现', options: { fill: { color: INK }, color: BG, bold: true, fontFace: CJK } },
    ],
    ['产品完成度 30%', '素材上传→拼豆→导出全流程可用，4 类素材入口，含示例场景一键演示'],
    ['用户与应用价值 30%', '「立体拼豆不会画图纸」是调研确认的全市场空白；直给图纸 + BOM + 品牌色板'],
    ['影像技术应用 30%', '遵循影石 3DGS 拍摄规范；深度流程与 DAP 同构；规划接入 Camera SDK / OSC'],
    ['AI 技术实际作用 30%', '浏览器端深度估计、CIEDE2000 配色、自动调参、离线知识库 + 千问助手、文字造景'],
    ['技术难度与质量', '零后端纯静态；WebGPU/WASM 自动降级；反投影/体素化/限色量化自研'],
    ['路演表述 10%', '3 分钟动线：拍（指南）→ 拼（工坊）→ 导出（图纸 BOM）'],
  ];
  s.addTable(tableRows, {
    x: M, y: 1.7, w: 12.23,
    colW: [3.1, 9.13],
    rowH: [0.42, 0.62, 0.72, 0.72, 0.72, 0.62, 0.55],
    fontFace: CJK, fontSize: 12.5, color: '36302A',
    border: { pt: 0.75, color: 'C9BEA6' },
    fill: { color: 'FFFFFF' },
    valign: 'middle',
    margin: 0.08,
  });
  s.addText('全部测试通过：关键路径 / 扩展 / 边界 / 融合 / 导出 五套自动化用例 + Node 端数学验证，控制台零错误。', {
    x: M, y: 6.5, w: 12.2, h: 0.4, margin: 0,
    fontFace: CJK, fontSize: 13, bold: true, color: TEAL,
  });
  footer(s, 7, TOTAL);
}

// ============================================================
// 8. 市场与路线图（浅色 · 时间线 + 分享卡）
// ============================================================
{
  const s = pres.addSlide();
  s.background = { color: BG };
  head(s, 'STEP 06 · 市场与规划', '从黑客松到拼豆人的日常');
  // 左：分享卡截图
  s.addImage({
    path: path.join(SHOTS, 'n1_share_card.png'),
    x: M, y: 1.75, w: 5.9, h: 3.1,
    sizing: { type: 'cover', w: 5.9, h: 3.1 },
    line: { color: INK, width: 1.5 },
    shadow: { type: 'outer', color: '211B14', blur: 6, offset: 3, angle: 45, opacity: 0.2 },
  });
  s.addText('作品分享卡片：晒图即传播——调研显示分享钩子比工具参数更重要', {
    x: M, y: 4.95, w: 5.9, h: 0.55, margin: 0,
    fontFace: CJK, fontSize: 11.5, color: MUTED, lineSpacingMultiple: 1.2,
  });
  // 右：路线图
  s.addText('路线图', {
    x: 6.9, y: 1.72, w: 5, h: 0.4, margin: 0,
    fontFace: CJK, fontSize: 17, bold: true, color: INK,
  });
  const road = [
    ['现在', '360 全景 → 立体图纸 + BOM，浏览器本地完成', CORAL],
    ['下一步', '接入 Camera SDK 实时拍摄教练；色板商店（官方 CSV）', TEAL],
    ['再下一步', '多视角 DDGS 重建补全遮挡；作品社区与图纸市场', MUSTARD],
  ];
  road.forEach(([t, d, c], i) => {
    const y = 2.25 + i * 0.95;
    bead(s, 6.95, y + 0.05, 0.34, c);
    if (i < 2) s.addShape(pres.shapes.RECTANGLE, {
      x: 7.11, y: y + 0.42, w: 0.02, h: 0.55, fill: { color: 'C9BEA6' }, line: { type: 'none' },
    });
    s.addText(t, {
      x: 7.5, y: y + 0.02, w: 1.6, h: 0.4, margin: 0,
      fontFace: CJK, fontSize: 14.5, bold: true, color: INK,
    });
    s.addText(d, {
      x: 9.0, y: y - 0.02, w: 3.8, h: 0.85, margin: 0,
      fontFace: CJK, fontSize: 12, color: '4B4335', lineSpacingMultiple: 1.25,
    });
  });
  // 用户与价值
  s.addShape(pres.shapes.RECTANGLE, {
    x: 6.9, y: 5.15, w: 5.88, h: 1.45,
    fill: { color: PAPER2 }, line: { color: INK, width: 1.25 },
  });
  s.addText('目标用户', {
    x: 7.15, y: 5.3, w: 2, h: 0.32, margin: 0,
    fontFace: CJK, fontSize: 13, bold: true, color: CORAL, charSpacing: 1,
  });
  s.addText('被小红书种草、想拼立体却不会画图纸的 Z 世代解压人群，与亲子/礼物定制场景。价值主张：我的旅行全景，变成一个能拿在手里的立体拼豆作品。', {
    x: 7.15, y: 5.65, w: 5.4, h: 0.9, margin: 0,
    fontFace: CJK, fontSize: 12, color: '4B4335', lineSpacingMultiple: 1.3,
  });
  footer(s, 8, TOTAL);
}

// ============================================================
// 9. 结尾（深色）
// ============================================================
{
  const s = pres.addSlide();
  s.background = { color: INK };
  s.addText('把世界，拼成一颗颗豆子。', {
    x: M, y: 2.1, w: 12.2, h: 1.0, margin: 0,
    fontFace: CJK, fontSize: 40, bold: true, color: BG, align: 'center',
  });
  s.addText('BeadOrbit · 360°立体拼豆工坊', {
    x: M, y: 3.25, w: 12.2, h: 0.5, margin: 0,
    fontFace: NUM, fontSize: 20, bold: true, color: TEAL, align: 'center',
  });
  s.addText('怎么拍——AI 摄影教练 · 怎么看——360° 立体拼豆 · 怎么拼——图纸与材料清单一次给齐', {
    x: M, y: 3.95, w: 12.2, h: 0.4, margin: 0,
    fontFace: CJK, fontSize: 14.5, color: 'CFC4B0', align: 'center',
  });
  const beadColors = [CORAL, MUSTARD, TEAL, '3F7FBF', '8E5AC8', CORAL, MUSTARD];
  beadColors.forEach((c, i) => {
    const x = W / 2 - (beadColors.length * 0.62) / 2 + i * 0.62;
    bead(s, x, 4.85, 0.42, c);
  });
  s.addText('谢谢，欢迎提问 · Q&A', {
    x: M, y: 5.7, w: 12.2, h: 0.4, margin: 0,
    fontFace: CJK, fontSize: 15, bold: true, color: MUSTARD, align: 'center',
  });
  s.addText('2026 影石 Insta360 Bold Maker 智能影像挑战赛 · AI+影像产品开发赛道', {
    x: M, y: 6.5, w: 12.2, h: 0.35, margin: 0,
    fontFace: CJK, fontSize: 11.5, color: '8D8172', align: 'center',
  });
}

// ---------- 输出 ----------
const out = path.join(__dirname, '..', 'BeadOrbit-路演PPT.pptx');
pres.writeFile({ fileName: out }).then(() => {
  console.log('written:', out);
});

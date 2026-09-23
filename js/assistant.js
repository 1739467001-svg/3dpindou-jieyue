// ============================================================
// assistant.js — 拼豆 AI 助手
// 默认：内置离线知识库（关键词匹配 + 打分排序）
// 可选：填入阿里百练 DashScope API Key 后切换千问大模型
// ============================================================

const KB = [
  {
    keys: ['拼豆是什么', '什么是拼豆', '拼豆 介绍', 'perler', '介绍'],
    a: '拼豆（Perler Beads / 融合豆）是 5mm 或 2.6mm 的低温塑料颗粒，在钉板上按格拼出图案，盖熨烫纸中温熨烫后融化粘合定型。国内主流是 2.6mm 迷你豆，主流色板有 MARD 291 色、COCO 291 色。它的魅力在于：像素画的耐心 + 立体手作的成就感。',
  },
  {
    keys: ['怎么拍', '拍摄', '相机', '参数', 'X5', '素材', 'insv', '360'],
    a: '用影石 X 系列全景相机：8K 30fps 全景视频 + 运动 HDR，固定参数；距主体 1–2 米，匀速步行 < 1m/s，绕主体多角度移动（别原地转），相邻画面 70–80% 重叠，角落靠近补拍，最后回到起点形成闭环。录 3–5 分钟一段即可。\n\n视频导出后在 App / Insta360 Studio 里拼成全景 MP4 或全景 JPG，再拿到工坊里用。',
  },
  {
    keys: ['熨烫', '烫', '定型', '保存'],
    a: '熨烫步骤：① 拼好的豆子上盖熨烫纸（烘焙油纸也可）；② 电熨斗调中温（约 140–160°C），不要蒸汽；③ 小圈轻压移动，看到豆子边缘微微融化粘连即可，过度会烫坏；④ 冷却后从钉板取下，翻面再轻烫一次更平整；⑤ 重物压一晚定型。\n\n立体作品建议分层层烫：烫好一层，冷却后再拼下一层叠加。',
  },
  {
    keys: ['色板', '色号', 'mard', '颜色', '配色'],
    a: '工坊默认使用 BeadOrbit 72 色示例色板。如果你手里的豆子是 MARD / COCO / Perler / Hama / Artkal，在工坊「导入官方色板 CSV」上传 code,hex 两列的色板文件，AI 就会用 CIEDE2000 感知色差匹配到你的真实色号——材料清单直接照单买豆。',
  },
  {
    keys: ['bom', '清单', '买多少', '多少颗', '用量'],
    a: '右侧「作品档案」会实时统计：豆子总数、用到颜色数、层数、成品尺寸。点「📋 材料清单 CSV」即可导出每种色号需要多少颗——建议每种多备 10% 的损耗。',
  },
  {
    keys: ['图纸', '怎么看', '分层', '施工'],
    a: '「🖼 分层图纸 PNG」导出后，每一层是一张网格图：一个格子 = 一颗豆子，格子里写着色号。拼装时从第 1 层（最底层）开始，按图摆豆，一层完成再往上叠。立体作品内部通常是空心的，AI 已经帮你把看不见的豆子省掉了。',
  },
  {
    keys: ['立体', '3d', '三层', '球形', '球形怎么拼', '圆'],
    a: '立体拼豆两种主流做法：① 分层叠加——就是本工坊的方式，一层层饼状堆起来，适合绝大多数造型；② 平板互锁——45°/60° 斜插互锁，适合盒子。球形、弧形这类曲面，用 2.6mm 迷你豆 + 更多层数会更圆润；层数在「体素精度」里调。',
  },
  {
    keys: ['深度', 'ai', '模型', '原理', '怎么实现的', '技术'],
    a: '工坊的 AI 链路：① Depth Anything V2（ONNX Runtime Web，WebGPU/WASM）估计全景图每个像素的深度；② 按 ERP 球面投影公式把像素反投影成三维点云；③ 点云体素化成 64³ 网格并做孤立降噪；④ 每颗体素在 CIELAB 空间用 CIEDE2000 匹配到拼豆色板。全流程在你的浏览器里跑，照片不上传。',
  },
  {
    keys: ['参数', '精度', '背景', '底座', '调'],
    a: '四个关键参数：\n· 体素精度：越高越细腻，豆子越多（24–72）\n· 主体深度：AI 判定「近」的半径，越小主体越鼓\n· 背景剔除：去掉天空和远景，只留主体\n· 底座：地面会自动变成圆形底座，不想留就调大背景剔除\n\n拿不准就先用默认值跑一次，看效果再微调。',
  },
  {
    keys: ['视频', 'mp4', '抽帧', 'insv'],
    a: '工坊支持 360 视频：上传后自动抽 8 个关键帧，你可以逐帧挑选主体最完整的一帧，或多帧融合（适合主体居中、相机绕拍的素材）。\n\n注意：.insv 是影石未拼接的双鱼眼格式，请先在 App / Insta360 Studio 导出为全景 MP4 或 JPG。',
  },
  {
    keys: ['比赛', '赛题', '影石', '挑战赛', 'bold'],
    a: '本站是 2026 影石 Insta360 Bold Maker 智能影像挑战赛「AI+影像产品开发」赛道作品，命题是「让相机更聪明：用 AI 重新定义怎么拍和怎么看」。我们的回答：怎么拍——结构化影石 3DGS 拍摄指南为 AI 摄影教练；怎么看/怎么玩——360° 全景变立体拼豆；技术上深度估计流程与影石 DAP 同构，并规划接入 Camera SDK / Media SDK / OSC。',
  },
  {
    keys: ['导出', '保存', '下载', 'pdf'],
    a: '作品档案下方有三个导出：🖼 分层图纸 PNG（带色号，直接打印）、📋 材料清单 CSV（照单买豆）、💾 作品 JSON（保存模型，以后可重新加载）。',
  },
  {
    keys: ['你好', 'hi', 'hello', '在吗', '开始'],
    a: '你好！我是拼豆助手 🧶 可以问我：拼豆怎么入门、怎么拍 360 素材、参数怎么调、图纸怎么看、熨烫技巧……随便问。',
  },
];

const FALLBACK = '这个问题我还答不上来。试试问我：拼豆入门 / 怎么拍 360 素材 / 参数怎么调 / 图纸怎么看 / 熨烫技巧 / 导出什么格式。\n\n（当前是离线知识库模式；点右上角 ⚙ 填入阿里百练 API Key 即可切换千问大模型实时回答。）';

// 关键词打分：完整子串命中权重高
function scoreKB(q) {
  const ql = q.toLowerCase();
  let best = null, bestScore = 0;
  for (const item of KB) {
    let s = 0;
    for (const k of item.keys) {
      const kl = k.toLowerCase();
      if (ql.includes(kl)) s += kl.length >= 3 ? kl.length : 2;
    }
    if (s > bestScore) { bestScore = s; best = item; }
  }
  return bestScore >= 2 ? best.a : null;
}

const SETTINGS_KEY = 'beadorbit_assistant';

function getSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  } catch { return {}; }
}

export function saveSettings(s) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

export function assistantStatus() {
  const s = getSettings();
  return s.apiKey ? '千问大模型模式' : '离线知识库模式';
}

export async function askAssistant(question) {
  const s = getSettings();
  if (s.apiKey) {
    try {
      const base = (s.apiBase || 'https://dashscope.aliyuncs.com/compatible-mode/v1').replace(/\/$/, '');
      const model = s.apiModel || 'qwen-plus';
      const res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${s.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content: '你是 BeadOrbit「360°立体拼豆工坊」的 AI 助手，一个参加 2026 影石 Insta360 Bold Maker 挑战赛的产品。用户可以用影石全景相机拍摄 360° 素材，网站用浏览器端 AI（深度估计→体素化→拼豆色板匹配）生成可 360° 旋转、逐颗拼装的立体拼豆作品，并导出分层图纸和材料清单。回答用简体中文，简洁友好，聚焦拼豆技巧、360 拍摄参数、产品使用和赛题相关内容。',
            },
            { role: 'user', content: question },
          ],
          temperature: 0.6,
          max_tokens: 600,
        }),
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content;
      if (text) return text.trim();
      throw new Error('API 返回为空');
    } catch (e) {
      console.warn('大模型调用失败，回退离线知识库', e);
      const local = scoreKB(question);
      return (local || FALLBACK) + `\n\n（大模型调用失败：${e.message}，已切换离线知识库）`;
    }
  }
  return scoreKB(question) || FALLBACK;
}

export const QUICK_QUESTIONS = [
  '拼豆是什么？',
  '怎么用 X5 拍出能拼的素材？',
  '立体作品怎么拼不散？',
  '参数怎么调？',
];

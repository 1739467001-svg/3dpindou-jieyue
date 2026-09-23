# BeadOrbit 云服务器部署检查清单

> 适用：阿里云 / 腾讯云轻量应用服务器（或其他有 root 的 VPS），Ubuntu 22.04 / 24.04
> 预计耗时：20–40 分钟（含证书申请）

## ⚠️ 最重要的一条：必须 HTTPS

**WebGPU（最快的 AI 推理后端）只在安全上下文可用**：`https://` 域名或 `localhost`。
如果直接用 IP + HTTP 访问，浏览器会禁用 WebGPU，自动退到 WASM 单线程（慢 5–10 倍，约 30–60 秒/张），现场演示会很难看。
所以：**域名 + HTTPS 证书是硬要求**，不是可选项。

## 步骤

### 1. 准备服务器
- [ ] 轻量服务器 2C2G 即可（纯静态站点，无计算压力）
- [ ] 系统 Ubuntu 22.04+，安全组放行 80 / 443
- [ ] 安装 nginx：`sudo apt update && sudo apt install -y nginx`

### 2. 域名与证书（二选一）
- [ ] **方案 A（推荐）**：域名解析到服务器 IP，申请免费证书
  - 阿里云：SSL 证书控制台 → 免费证书 → 下载 Nginx 格式（pem + key）
  - 或 certbot：`sudo apt install certbot python3-certbot-nginx && sudo certbot --nginx -d 你的域名`
- [ ] **方案 B（临时演示）**：没有域名时，用 IP 自签证书（浏览器会告警，点高级→继续即可，WebGPU 仍可用）

### 3. 放置配置与代码
```bash
sudo mkdir -p /var/www/beadorbit
# 方式一：一键脚本（在本地项目目录执行）
./deploy/deploy.sh root@服务器IP /var/www/beadorbit
# 方式二：手动
rsync -avz --exclude node_modules --exclude tools ./ root@服务器IP:/var/www/beadorbit/
sudo cp deploy/nginx.conf /etc/nginx/conf.d/beadorbit.conf
sudo vim /etc/nginx/conf.d/beadorbit.conf   # 改 server_name、root、证书路径
sudo nginx -t && sudo systemctl reload nginx
```

### 4. 上线前自检（在服务器上执行）
- [ ] `curl -I https://你的域名/` 能看到：
  - `cross-origin-opener-policy: same-origin`
  - `cross-origin-embedder-policy: require-corp`
- [ ] `curl -I https://你的域名/models/depth-anything-v2-small_int8.onnx` 返回 200
- [ ] `curl -I https://你的域名/vendor/ort/ort-wasm-simd-threaded.wasm` 返回 200

### 5. 浏览器验收（Chrome / Edge）
- [ ] 打开站点，F12 Console **无红色错误**
- [ ] 点「蘑菇小屋」→ 约 7 秒出模型（WebGPU）；若超过 30 秒说明退到了 WASM，检查 HTTPS 与 COOP/COEP 头
- [ ] 逐颗模式点击放豆正常，导出 PNG/CSV 正常

## 备选：零运维方案

| 平台 | 做法 | COOP/COEP | 备注 |
|------|------|-----------|------|
| Vercel | 项目根放 `deploy/vercel.json`，`vercel --prod` | ✅ 支持 | 国内访问不稳定，适合有海外评委的场景 |
| Netlify | 放 `_headers` 文件（内容同 vercel.json 的 headers） | ✅ 支持 | 同上 |
| GitHub Pages | 直接推 gh-pages | ❌ 不支持自定义头 | 会退 WASM 单线程，仅作备份 |

## 现场演示应急预案

1. **主路径**：笔记本本地 `node serve.mjs 8080` → `http://localhost:8080`（localhost 是安全上下文，WebGPU 可用，且不依赖会场网络）
2. **备用路径**：云服务器 HTTPS 域名（证明可在线访问）
3. **断网兜底**：模型与运行时全部内置（约 111MB），本地跑无需任何外网

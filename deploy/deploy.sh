#!/usr/bin/env bash
# ============================================================
# BeadOrbit 一键部署脚本
# 用法：
#   ./deploy/deploy.sh user@your-server-ip [远程目录]
# 依赖：本地能 ssh 到服务器；服务器已按 deploy/checklist.md 配好 nginx
# 原理：rsync 同步交付文件 → 远程 nginx -t → reload
# ============================================================
set -euo pipefail

REMOTE="${1:-}"
REMOTE_DIR="${2:-/var/www/beadorbit}"
LOCAL_DIR="$(cd "$(dirname "$0")/.." && pwd)"

if [[ -z "$REMOTE" ]]; then
  echo "用法: $0 user@server-ip [远程目录]"
  echo "示例: $0 root@123.45.67.89 /var/www/beadorbit"
  exit 1
fi

echo "==> 部署目标: $REMOTE:$REMOTE_DIR"
echo "==> 本地源:   $LOCAL_DIR"

# 只同步交付所需文件（排除开发依赖与测试产物）
rsync -avz --delete \
  --exclude 'node_modules/' \
  --exclude 'gui-test-screenshots/' \
  --exclude 'tools/' \
  --exclude '.git/' \
  --exclude '.DS_Store' \
  --exclude '*.log' \
  --exclude 'package.json' \
  --exclude 'package-lock.json' \
  "$LOCAL_DIR"/ "$REMOTE:$REMOTE_DIR"/

echo "==> 文件已同步，远程校验 nginx 配置并重载…"
ssh "$REMOTE" "sudo nginx -t && sudo systemctl reload nginx && echo OK"

echo ""
echo "🎉 部署完成！访问 https://你的域名/ 验证："
echo "   1. 页面正常加载，导航/hero 拼豆球正常"
echo "   2. 点「蘑菇小屋」，7 秒左右出现 3D 拼豆模型"
echo "   3. F12 → Network：models/*.onnx 与 vendor/ort/*.wasm 返回 200 且带 COOP/COEP 头"
echo "   4. F12 → Console：无红色错误"

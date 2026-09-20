#!/bin/sh
# MeNote 容器启动脚本
# 处理 config/lock.js（安装锁）在容器场景下的生命周期：
#   - lock.js 不随镜像分发（新用户需进 /install 安装向导）
#   - 容器重建后镜像层是全新的，lock.js 若只写在容器层会丢失
#   - data/ 是持久卷：DB 在卷里。恢复规则——卷里有 DB 但锁丢失 ⇒ 已装过的老用户，
#     自动重写 lock.js，避免被重新打回安装向导；DB 不存在 ⇒ 全新部署，进安装向导

LOCK_FILE="config/lock.js"
VERSION=$(node -p "require('./package.json').version")

echo "MeNote v${VERSION} 启动中..."

# 恢复安装锁（镜像内不带锁，此处依据持久卷状态重建）
if [ ! -f "$LOCK_FILE" ] && [ -f "data/menote.db" ]; then
  echo "检测到已有数据库但安装锁丢失（容器重建），恢复安装锁"
  cat > "$LOCK_FILE" << EOF
// 本文件标识系统已安装，不可删除。
module.exports = {
    install: true,
    version: '${VERSION}'
};
EOF
fi
[ ! -f config/app.js ] && cp config.demo/app.js config/app.js
[ ! -f config/db.js ] && cp config.demo/db.js config/db.js
[ ! -f config/routes.js ] && cp config.demo/routes.js config/routes.js
[ ! -f config/view.js ] && cp config.demo/view.js config/view.js

# 依赖自检：镜像应已带 node_modules，卷误挂覆盖或手动调试时兜底重装
if [ ! -d "node_modules/jj.js" ]; then
  echo "node_modules 缺失，安装依赖"
  npm ci --omit=dev --no-audit --no-fund --registry=https://registry.npmmirror.com
fi

# 确保运行期目录存在（首次启动卷是空的）
mkdir -p data public/upload

echo "启动服务"
exec node server.js

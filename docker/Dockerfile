# syntax=docker/dockerfile:1
# MeNote 知识库 —— 多阶段构建
#   web  阶段：构建前端（web/ 的 Vite 工程）→ public/static/dist + public/static/vendor
#   deps 阶段：安装运行时依赖
#   最终镜像：运行时依赖 + 源码 + 前端构建产物

# ── 阶段 1：前端构建 ──────────────────────────────────────────────
# 用 bookworm-slim（glibc）而非 alpine：Vite 8 底层是 Rolldown，带 Rust 原生二进制，
# 构建阶段用 glibc 可以完全绕开 musl 二进制缺失的问题；该阶段不进最终镜像，体积无所谓。
FROM node:22-bookworm-slim AS web
WORKDIR /menote
COPY package.json package-lock.json ./
# --ignore-scripts：构建阶段只需要 vite/vue 这些纯 JS 包，
# 跳过 sqlite3/iroh 的原生编译，既快又不会因工具链缺失而失败
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY web ./web
# 产物：public/static/dist（hash 资源）+ public/static/vendor（Vditor 运行时资源）
RUN npm run build

# ── 阶段 2：运行时依赖 ────────────────────────────────────────────
FROM node:20.19.6-alpine3.22 AS deps
WORKDIR /menote
# 先只拷贝依赖清单，命中层缓存
COPY package.json package-lock.json ./
# prebuild-install 优先下载 napi 预编译二进制（iroh/sqlite3 官方提供 musl 包）；
# 万一源被墙则回退 node-gyp 本地编译，这里备好工具链（仅构建阶段，不进最终镜像）
RUN apk add --no-cache python3 make g++ \
    && npm ci --omit=dev --no-audit --no-fund

# ── 阶段 3：运行镜像 ──────────────────────────────────────────────
FROM node:20.19.6-alpine3.22
ENV NODE_ENV=production
ENV TZ=Asia/Shanghai
WORKDIR /menote
# node_modules 来自构建阶段（多阶段，工具链不进最终镜像）
COPY --from=deps /menote/node_modules ./node_modules
# 源码 + docker/Run.sh 一并带入
COPY . .
COPY config config.demo
# 前端构建产物：必须放在 COPY . . 之后，确保以构建阶段的新鲜产物为准
# （这两个目录已加入 .gitignore 与 .dockerignore，构建上下文里没有它们）
COPY --from=web /menote/public/static/dist ./public/static/dist
COPY --from=web /menote/public/static/vendor ./public/static/vendor

# HTTP（Web/管理/API）；P2P 走 iroh relay+打洞，无需开放入站端口
EXPOSE 3107
# 配置文件
VOLUME /menote/config
# 数据库 + P2P 节点密钥/白名单
VOLUME /menote/data
# 用户上传的附件
VOLUME /menote/public/upload

CMD [ "sh", "docker/Run.sh" ]

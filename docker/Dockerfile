# syntax=docker/dockerfile:1
# MeNote 知识库 —— 多阶段构建
# 前端静态资源已随仓库分发（public/），镜像内只需安装运行时依赖

FROM node:20.19.6-alpine3.22 AS deps
WORKDIR /menote
# 先只拷贝依赖清单，命中层缓存
COPY package.json package-lock.json ./
# prebuild-install 优先下载 napi 预编译二进制（iroh/sqlite3 官方提供 musl 包）；
# 万一源被墙则回退 node-gyp 本地编译，这里备好工具链（仅构建阶段，不进最终镜像）
RUN apk add --no-cache python3 make g++ \
    && npm ci --omit=dev --no-audit --no-fund

FROM node:20.19.6-alpine3.22
ENV NODE_ENV=production
ENV TZ=Asia/Shanghai
WORKDIR /menote
# node_modules 来自构建阶段（多阶段，工具链不进最终镜像）
COPY --from=deps /menote/node_modules ./node_modules
# 源码 + 前端静态资源（public/ 已随仓库分发）+ docker/Run.sh 一并带入
COPY . .
COPY config config.demo

# HTTP（Web/管理/API）；P2P 走 iroh relay+打洞，无需开放入站端口
EXPOSE 3107
# 配置文件
VOLUME /menote/config
# 数据库 + P2P 节点密钥/白名单
VOLUME /menote/data
# 用户上传的附件
VOLUME /menote/public/upload

CMD [ "sh", "docker/Run.sh" ]

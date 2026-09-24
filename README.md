# MeNote

MeNote，一个轻量级个人笔记知识库系统，支持 Markdown 笔记、分类管理、双向链接、知识图谱。内置 P2P 隧道，手机 App 无需公网 IP 即可直连 NAS 上的笔记服务。数据本地存储，隐私自主可控。

## 特性

- **Markdown 编辑器**：基于 Vditor，支持实时预览、代码高亮、表格、任务列表等
- **分类管理**：树形分类结构，支持拖拽排序
- **知识图谱**：基于 vis-network 的笔记关联可视化
- **浅色 / 暗黑 / 自适应主题**：前台与后台都支持，访客可自行切换，站点默认主题在后台设置
- **P2P 远程访问**：通过 iroh QUIC 隧道，手机/外网可直接访问家里电脑上的知识库
- **RESTful API**：提供完整的分类/笔记 CRUD 接口，支持 Token 认证
- **移动端适配**：管理后台响应式设计，手机端单栏视图栈

## 技术栈

- **后端**：Node.js v20 + [jj.js](https://github.com/yafoo/jj.js) 框架（Koa 3 子类）+ SQLite
- **前端**：Vue 3 + Element Plus + Vditor + vis-network
- **P2P**：[@number0/iroh](https://www.npmjs.com/package/@number0/iroh) 1.1.0（QUIC 双向流）
- **Android 端**：Kotlin + WebView + iroh-android FFI

## 快速开始

### 环境要求

- Node.js >= 20.19
- npm >= 10

### 安装

```bash
npm install
```

### 启动

首次启动会进入安装向导，按提示设置管理员账号：

```bash
npm start
```

服务默认监听 **3107** 端口，浏览器打开 `http://localhost:3107` 即可访问。

### Docker

#### 单容器启动

```bash
docker run -d \
  --name menote \
  -p 3107:3107 \
  -v $(pwd)/config:/menote/config \
  -v $(pwd)/data:/menote/data \
  -v $(pwd)/upload:/menote/public/upload \
  yafoo/menote:latest
```

**重要**：必须挂载两个卷：
- `data/` — SQLite 数据库、P2P 私钥、白名单配置
- `public/upload/` — 用户上传的附件（图片、文档等）

#### docker-compose

在项目根目录创建 `docker-compose.yml`：

```yaml
version: '3.8'

services:
  menote:
    image: yafoo/menote:latest
    container_name: menote
    restart: unless-stopped
    ports:
      - "3107:3107"
    volumes:
      - ./config:/menote/config
      - ./data:/menote/data
      - ./upload:/menote/public/upload
    environment:
      - TZ=Asia/Shanghai
```

启动：

```bash
docker compose up -d
```

#### 飞牛 FPK 部署

飞牛 NAS 支持 Docker Compose 应用市场。在 FPK 中搜索「MeNote」或手动导入上述 `docker-compose.yml`：

1. **新建应用** → 选择「Docker Compose」→ 粘贴上方 YAML 内容
2. **设置存储路径**：将 `./config`、`./data` 和 `./upload` 映射到 NAS 上的持久化目录（如 `/volume1/docker/menote`）
3. **启动应用**，浏览器访问 `http://NAS_IP:3107`

首次访问会进入安装向导，按提示设置管理员账号即可。

数据目录 `data/` 包含 SQLite 数据库和 P2P 私钥，建议挂载到宿主机持久化。

## 目录结构

```
menote/
├── app/                    # 应用代码
│   ├── admin/             # 管理后台（SPA）
│   ├── api/               # RESTful API
│   ├── app/               # 前台公开页面
│   ├── install/           # 安装向导
│   ├── middleware/        # 中间件（认证、安装检查）
│   ├── model/             # 数据模型
│   └── view/              # 模板文件
├── config/                # 配置文件
├── docker/                # Docker 构建文件
├── public/                # 静态资源
├── lib/                   # 公共库（P2P 核心逻辑）
├── android/               # Android 客户端源码
├── server.js              # 入口文件
└── package.json
```

## API 文档

API 基础路径：`/api/:controller/:action`

### 认证方式

- **Cookie**：管理后台登录后自动携带，拥有全部权限
- **Token**：URL query `?token=xxx` 或 Header `Authorization: Bearer xxx`

Token 只能访问 `cate` 和 `note` 两个控制器，其他接口（如 `p2p`、`user`）仅限 Cookie 认证。

### 分类接口

| 方法 | 路径 | 说明 | 所需权限 |
|---|---|---|---|
| GET | `/api/cate/tree` | 获取分类树 | PERM_CATE_READ |
| POST | `/api/cate/create` | 创建分类 | PERM_CATE_CREATE |
| POST | `/api/cate/edit` | 编辑分类 | PERM_CATE_EDIT |
| POST | `/api/cate/sort` | 拖拽排序 | PERM_CATE_EDIT |
| POST | `/api/cate/delete` | 删除分类 | PERM_CATE_DELETE |

### 笔记接口

| 方法 | 路径 | 说明 | 所需权限 |
|---|---|---|---|
| GET | `/api/note/list` | 笔记列表 | PERM_NOTE_READ |
| GET | `/api/note/detail` | 笔记详情 | PERM_NOTE_READ |
| POST | `/api/note/create` | 创建笔记 | PERM_NOTE_CREATE |
| POST | `/api/note/edit` | 编辑笔记 | PERM_NOTE_EDIT |
| POST | `/api/note/pin` | 置顶/取消置顶 | PERM_NOTE_EDIT |
| POST | `/api/note/sort` | 调整顺序 | PERM_NOTE_EDIT |
| POST | `/api/note/delete` | 删除笔记 | PERM_NOTE_DELETE |

### 权限位定义

```js
PERM_CATE_READ    = 1   // 读分类
PERM_CATE_CREATE  = 2   // 建分类
PERM_CATE_EDIT    = 4   // 改分类
PERM_CATE_DELETE  = 8   // 删分类
PERM_NOTE_READ    = 16  // 读笔记
PERM_NOTE_CREATE  = 32  // 建笔记
PERM_NOTE_EDIT    = 64  // 改笔记
PERM_NOTE_DELETE  = 128 // 删笔记
```

权限值可叠加，如 `255` 表示全部权限。

## P2P 远程访问

MeNote 内置 P2P 隧道功能，允许手机/外网直接访问家里电脑上的知识库，无需公网 IP 或端口映射。

### 配对流程

1. 电脑端：管理后台 → P2P 管理 → 生成配对二维码
2. 手机端：打开 MeNote App → 扫码配对，点击“启动隧道”
3. 电脑端：手机端首次启动隧道后，电脑端会弹出授权窗口，设置个名字，点击授权
4. 等到配对连接成功后，手机端点击“打开MeNote”，可通过 QUIC 隧道直接访问电脑端服务

### 技术细节

- 协议：iroh QUIC，ALPN `menote-p2p/1`
- 加密：端到端加密，节点密钥持久化到 `data/p2p-node-secret.bin`
- 重连：断线自动指数退避重连（5s→10s→20s→40s→60s）

详见 [lib/p2p.js](lib/p2p.js) 和 [android/](android/) 目录。

## 开发

```bash
npm run dev    # 开发模式（热重载）
npm start      # 生产模式
```

测试脚本需放在项目根目录下运行（jj.js 的 `base_dir=require.main.path` 机制）。

## 许可证

MIT License — 详见 [LICENSE](LICENSE)

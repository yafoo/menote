# MeNote — AI Agent 指导文件

本文件为 AI 编程助手（Copilot、Cursor、Claude Code、Octo 等）提供项目上下文，帮助快速理解架构、避免常见陷阱。

## 项目概述

MeNote 是一个轻量级个人笔记知识库系统，支持 Markdown 笔记、分类管理、双向链接、知识图谱。内置 P2P 隧道，手机 App 无需公网 IP 即可直连 NAS 上的笔记服务。数据本地存储，隐私自主可控。

**核心特性**：
- Markdown 编辑器（Vditor，实时预览）
- 树形分类管理（拖拽排序）
- 知识图谱可视化（vis-network）
- P2P 远程访问（iroh QUIC 隧道）
- RESTful API（Token 认证）
- 移动端适配（响应式 admin SPA）

## 技术栈

### 后端
- **框架**：[jj.js](https://github.com/yafoo/jj.js) 1.1.1（Koa 3 子类，Node.js v20.20.2）
- **数据库**：SQLite（`data/menote.db`，表前缀 `menote_`）
- **P2P**：[@number0/iroh](https://www.npmjs.com/package/@number0/iroh) 1.1.0（QUIC 双向流）
- **端口**：3107（写死在 `server.js`）

### 前端
- **框架**：Vue 3 + Vite（**前后台都是 SFC 工程，无运行时编译模板**）
- **UI**：Element Plus（**仅后台**；前台不引，体积考虑）
- **编辑器**：Vditor（后台编辑用，前台详情页只调 `Vditor.preview`）
- **图谱**：vis-network（前后台共用同一份 `vendor-vis` chunk）
- **双入口**：`web/src/admin/` → `admin.html`；`web/src/home/` → `home.html`，都构建到 `public/static/dist/`
  （前台源码目录叫 **home** 不是 public——`public/` 是 jj.js 的静态目录，同名极易看混）
- **路由模式**：后台 hash（`#/admin/...`）；前台 **history**（要保住 `/note/123.html` 这类干净 URL）

### Android 端
- **工程路径**：`android/`（包名 `com.menote.p2p`，当前 v1.1.0 = versionCode 14）
- **技术**：Kotlin + WebView + iroh-android FFI
- **构建**：Gradle 8.14.3 / AGP 8.10.1 / Kotlin 2.2.21 / compileSdk 35 / minSdk 29
- **JDK**：需要 JDK 20（`D:\Program Files\Java\jdk-20`，PATH 默认 JDK 8 不够）
- **一键构建**：`android\build-apk.bat`（自动设 JDK20 → assembleRelease → 输出 `MeNote-vX.Y-arm64.apk`）

## 目录结构

```
menote/
├── server.js              # 入口：new App().listen(3107) + require('./lib/p2p').init(app)
├── lib/p2p.js             # P2P 服务（@number0/iroh，随主服务启动，ALPN 'menote-p2p/1'）
├── android/               # Android 客户端工程（git 随主项目追踪）
├── app/
│   ├── admin/             # 后台：controller/{index,login}.js + middleware/auth.js + view/login_index.htm
│   ├── api/controller/    # REST API：base.js（cookie 或 Bearer token 认证基类）、note/cate/search/graph/site/token/user/upload/p2p.js、pub.js（前台公开，免认证）
│   ├── app/               # 前台：controller/ 全是薄壳，只输出 SPA 外壳（原 SSR 的 view/ 已于 2026-09-23 删除）
│   ├── install/           # 安装向导（config/lock.js 判断已安装）
│   ├── middleware/        # auth.js（cookie + token 两级认证 + pub 放行）
│   └── model/             # note/cate/site/token/user.js（Model 基类，this.db 链式查询）
├── config/                # app.js(base_dir/static_dir)、db.js(sqlite)、routes.js、view.js、lock.js
├── data/                  # menote.db + p2p-key.bin（节点密钥）+ p2p-allow.json（白名单）
├── docker/                # Docker 构建文件（Dockerfile、Run.sh、Dockerfile.dockerignore）
├── fpk/                   # 飞牛 fnOS FPK 应用打包目录（详见下方"飞牛 FPK 打包"章节）
├── web/                   # 前端工程（Vite + Vue3 SFC，详见下方"前端构建"章节）
│   ├── vite.config.mjs    # root=web、双入口、产物→public/static/dist、dev proxy→3107
│   ├── admin.html         # 后台入口（构建产出 public/static/dist/admin.html）
│   ├── home.html          # 前台入口（构建产出 public/static/dist/home.html）
│   ├── vendor-vditor.mjs  # 构建时从 node_modules 生成 Vditor 运行时资源（白名单式，约 9.8M）
│   ├── check-element-plus.mjs  # 构建期自检：EP 三处清单 ↔ 模板里的 el-* 标签/图标
│   ├── src/admin/         # 后台源码：main.js / App.vue / api / store / router / components / views
│   └── src/home/          # 前台源码：main.js / App.vue / api / store / router / utils / styles / components / views
├── public/static/dist/    # 【构建产物，git 忽略】hash 化的 js/css + admin.html + home.html
├── public/static/vendor/  # 【构建产物，git 忽略】Vditor 运行时资源（lute/icons/i18n…）
└── public/upload/         # 用户上传的附件
```

> `public/static/common/`（旧的运行时编译 vendor：vue/element-plus/vditor/sortablejs）已于 2026-09-23 前台迁移完成后删除——前后台都不再需要它。

## 前端构建（Vite）

前后台都已从"运行时编译"迁到标准 Vite + Vue SFC 工程，源码在 `web/`（双入口）。

```bash
npm run build        # 生成 Vditor 资源 + Vite 构建（两个入口）→ public/static/dist/
npm run dev:web      # Vite dev server（5173），proxy 到 3107
npm run test:smoke   # 前台 SPA 冒烟测试（需服务已在 3107 运行）
```

**硬规则**：改了 `web/` 下的任何文件，**必须重新 `npm run build`** 才对 `http://…:3107/` 与 `/admin` 生效——页面加载的是 `public/static/dist/` 里的 hash 产物，不是源码。

要点：
- `@` 别名指向 `web/src`，所以内部引用写成 `@/admin/store/index.js`、`@/home/store/index.js` 这种形式
- `public/static/dist`、`public/static/vendor` 都在 `.gitignore` 与 `docker/Dockerfile.dockerignore` 里；Docker 镜像由 `Dockerfile` 的 `web` 阶段现场构建（`node:22-bookworm-slim`，避开 Vite 8/Rolldown 的 musl 二进制问题）
- 后台控制器 `app/admin/controller/index.js` 直接读 `public/static/dist/admin.html` 输出（不再走 `$fetch()` 模板渲染），鉴权仍在 `_init`
- **`publicDir: false`**：`public/` 归 jj.js 独占，绝不能让 Vite 把它当 publicDir 整份复制进产物。副作用是模板里的 `<img src="/logo.png">` 会被 Vite 当构建期资源去解析并报 `UNRESOLVED_IMPORT`，因此 `vite.config.mjs` 里显式关掉了 `transformAssetUrls.img`
- Vditor 的 `cdn` 指向 `/static/vendor/vditor`：它运行时仍按 cdn 动态加载 lute/icons/i18n/主题等资源，**其中 icons 走同步 XHR，因此 cdn 必须同源**（换成独立域名会因 CORS 挂掉）
- 分包用 Rolldown 的 `codeSplitting.groups`（`vendor-vue` / `vendor-element-plus` / `vendor-vditor` / `vendor-vis` / `vendor`），目的是让缓存更耐用；**与 `advancedChunks` 同时指定时后者被忽略**
- Element Plus **按需引入**：`web/src/admin/main.js` 里显式注册 30 个组件 + 33 行单组件 style import，`@element-plus/icons-vue` 逐个 import。**新增组件必须同时加到 `COMPONENTS` 和 style import 两处**，否则模板里是未解析的自定义元素（生产构建无警告，静默白屏）。`ElLoading` 是插件不是组件，`v-loading` 要 `app.use(ElLoading)` 单独注册
- 上面这三处漏改**不会报任何错**（Vue 生产构建不输出 `Failed to resolve component`），所以 `npm run build` 前会先跑 `web/check-element-plus.mjs`（`npm run check:ep`）做一致性自检：把 main.js 的三份清单和**模板里真实出现的 `el-*` 标签 / PascalCase 图标**双向比对，ERROR 即中断构建。单独跑加 `--warn-only` 只看报告不失败

## 前台 SPA 架构（2026-09-23 迁移）

前台原来是 jj.js 模板 SSR（`app/app/view/*.htm`），现已全部迁到 Vue SPA。

### 服务端：薄壳控制器

`config/routes.js` 里 5 条前台路由**必须保留**：

```js
{url: '/',             path: 'app/index/index'},
{url: '/note/:id.html', path: 'app/note/note',  name: 'note'},
{url: '/cate/:id',      path: 'app/cate/cate',  name: 'cate'},
{url: '/search',        path: 'app/search/search'},
{url: '/graph',         path: 'app/graph/graph'}
```

它们现在全是 `return await this.spa();`（`app/home/controller/index.js` 的 `spa()` 读 `public/static/dist/home.html`，注入站点默认主题后输出）。

**为什么不能删**：前台用 history 路由，用户直接访问或刷新 `/note/123.html` 时浏览器先请求服务端；服务端没有对应路由就 404，此时 SPA 外壳还没加载，前端路由根本没机会介入。

保留 1:1 的控制器文件（而不是全指向同一个 action）是为了：路由名不变、将来某页要加服务端逻辑（如详情页注入 SSR meta）时有现成位置。

代价：**没有 SSR，`<title>` 只能前端用 `document.title` 设**，搜索引擎收录不如原 SSR。

### 前端：`web/src/home/`

- 入口 `web/home.html` → 构建产出 `public/static/dist/home.html`
- **不引 Element Plus**（前台只要轻量样式，`web/src/home/styles/home.css` 从旧的 `public/static/app/style.css` 迁移而来，类名保持不变）
- `router/index.js` 用 **history 模式**，5 条路由全懒加载；详情页路径是自定义正则 `/note/:id(\\d+).html`
- `store/index.js` 是裸 `reactive`（不是 Pinia）——前台只有"站点配置 + 分类树"这点共享数据，不划算引状态库
- 详情页 `NoteView.vue` **动态 import** `vditor` + `vditor/dist/index.css`，加载后缓存 Promise，同会话切笔记不重复请求
- 图谱页 `GraphView.vue` **动态 import** `vis-network/standalone`（615 kB 只在 `/graph` 下载）

### 公开接口：`app/api/controller/pub.js`（免认证）

`app/middleware/auth.js` 对 `controller === 'pub'` 直接放行。因此**每个方法都必须自己保证只暴露公开数据**——本项目的"公开"定义是**分类级开关 `menote_cate.is_public = 1`**（没有笔记级开关）。新增方法时自查三件事：

1. 是否 `INNER JOIN cate` 且过滤 `is_public = 1`（用 LEFT JOIN 会让未分类笔记漏出来）
2. 返回字段里有没有 `content` / 附件路径这类不该给匿名用户的东西
3. 有没有间接泄露私密笔记的**存在**（数量、标题、ID、链接关系）

已有方法：`config`（站点白名单 key + 公开分类树）/ `notes` / `note` / `search` / `graph`。

**分类是树，`pub.notes` 的 `cate_id` 要连子分类一起查**（2026-09-24 修）：只查自己那一层的话，挂在子分类下的笔记会"消失"——点「生活随笔」看不到「测试分类」里的笔记。做法是先用 `cate.getPublicCateIds()` 展开成「自己 + 全部公开子孙」，再走 `getPublicNoteList({cate_ids})` 的 `IN` 过滤。

> ⚠️ 展开时**只收集 `is_public = 1` 的子孙**，这是安全边界不是优化。「公开父分类 → 私密子分类」是很自然的结构（本项目就是 `生活随笔(公开) > 测试分类(公开) > 三级分类(私密)`），把私密子孙的 id 一起带进查询虽然会被 `getPublicNoteList` 里那条 `c.is_public = 1` 兜住，但那是"恰好还有一层防线"，不该依赖。
>
> `is_show` **不参与**这里的过滤——它只控制导航显不显示，后台也没有对应开关（分类表单只有"公开/私密"），与"数据能不能被看到"无关。
>
> 同一层的 `getPublicNotes()`（无调用方）和 `searchNotes()` 的 `cate_id` 仍是**精确匹配、不展开子分类**；前台的搜索页不传 `cate_id` 所以不受影响，后台搜索传的是用户在树里点中的那个节点，精确匹配是想要的语义。

**迁移时顺带修掉的 3 处泄露**（旧 SSR 实现就有）：

| 位置 | 旧行为 | 现在 |
|---|---|---|
| `pub.graph` 的边 | `note_link` 全表 select → 把「私密↔私密」的边吐给匿名用户，等于泄露私密笔记数量与关联结构 | 四个 INNER JOIN 把两端都卡在 `is_public=1` |
| 反向链接 | `getBacklinks` 会带出私密笔记标题 | 改用 `getPublicBacklinks` |
| 站点配置 | `menote_site` 整表返回（管理员可自由加 key，等于替他决定"这些都能公开"） | 白名单 6 个 key：`sitename`/`description`/`keywords`/`siteurl`/`beian`/`theme`（`theme` 还会过一遍 `lib/theme.js` 的 `normalize`，防止库里的脏值被拿去套 CSS 属性） |

### Vditor 运行时资源（`web/vendor-vditor.mjs`）

`import Vditor from 'vditor'` 只拿到编辑器本体（`package.json` 的 `main = dist/index.js`，被 Vite 打进 admin.js）。**Vditor 在运行时还会按 `options.cdn` 动态加载 22 处子资源**——lute（Markdown 引擎）、icons（工具栏图标，同步 XHR）、i18n、预览 iframe 的 index.css/method.min.js、katex/mermaid 等。所以 `public/static/vendor/vditor` 这个目录**省不掉**。

为什么不直接用官方默认的 `https://unpkg.com/vditor@<版本>`：MeNote 有 P2P 直连和纯内网部署场景，没外网时 lute/icons 拉不到 → **编辑器直接打不开**（不是降级）。所以自托管。

脚本是**白名单式**复制（不是全量），dist 原本 22.6M，剔掉三块浪费后约 9.6M：

| 剔除项 | 体积 | 依据 |
|---|---|---|
| `dist/index.js` / `index.min.js` / `method.js` | 1.1M | index.js 已被 Vite 打进 bundle、index.min.js 无人引用、预览 iframe 引的是 method.min.js——这三份在 vendor 目录里永远不会被请求 |
| 11 种语言包只留 `zh_CN.js`、两套图标只留 `ant.js` | 0.08M | `NoteEditor.vue` 的 `lang:'zh_CN'` + Vditor 默认 `icon:'ant'` |
| 76 个 hljs 主题只留 github 系 | 1.19M | Vditor 默认 `preview.hljs.style:'github'` |
| 低频图表渲染器（见 `ENABLED_OPTIONAL`） | 11.2M | 默认只开 mermaid |

**改 Vditor 选项时必须同步改脚本里的白名单**（`LANG` / `ICON` / `CODE_THEMES` / `CONTENT_THEMES`），否则运行时 404。

脚本内置**自检**：扫描 `dist/index.js` 与 `dist/method.min.js` 里所有 `/dist/...` 字面量，逐条核对产物里是否存在，缺了就报错退出（白名单漏项只在用户写特定语法时才暴露，光看"构建成功"发现不了）。版本戳含白名单指纹，且**等自检通过后才落盘**。

> ⚠️ **改这个脚本时务必按 Linux 语义自查 —— 本机（Windows）的"构建通过"不能作为 CI 会通过的证据。**
>
> 这个坑真实发生过一次：vditor 源码里有 `".../dist/index.css\"/>"` 这种**转义引号**写法，提取用的正则把单/双引号与反引号都当定界符，**不认 JS 转义**，于是把转义用的 `\` 一起 capture 进 `rel`，得到 `"index.css\"`。随后第 195 行的 `fs.stat(join(dest, rel))` 出现平台分歧：
>
> | 平台 | 行为 |
> |---|---|
> | Windows | 尾部 `\` 在**系统调用层**就被当路径分隔符吃掉，`stat` 照样成功 → 本地永远"通过" |
> | Linux | `\` 是字面字符，`dist/index.css\` 不存在 → 判 missing → **`exit 1`** |
>
> 后果：从 SFC 迁移（`14b7b47`）起，**GitHub Actions 连续 2 次构建全部失败**（run #37/#38），而本地一次都没察觉。修法是提取时加 `.replace(/\\/g, '/')` 归一。
>
> 教训推广：凡是构建脚本里出现**路径拼接、文件名比较、大小写敏感比较**的地方，都要主动按 Linux 语义过一遍——CI/Docker 全在 Linux 上跑，日常开发却在 Windows。
>
> 两个配套的验证技巧：
> - **版本戳会短路自检**（命中直接 `exit 0`）→ 验证白名单/自检相关改动前，必须先删 `public/static/vendor/vditor/.version`，否则看到的"通过"是短路出来的。CI/新克隆上该目录不存在，必然走完整路径。
> - **别用 `fs.stat` 仿真 Linux**：Windows 文件系统在系统调用层就吃掉尾部 `\`（连 `dest + '/' + rel` 字符串拼接都救不了）。要忠实仿真，得先遍历产物目录得到**真实相对路径集合**，再做 membership 判断——这才是 Linux 目录查找（字节级精确匹配文件名）的语义。

想恢复某个渲染器：把键名加进 `ENABLED_OPTIONAL`（`mermaid` / `graphviz` / `echarts` / `markmap` / `abcjs` / `smiles` / `flowchart` / `wavedrom` / `plantuml` / `mathjax`）。关掉的后果只是「该 ``` 代码块回落成源码显示」，不影响编辑保存。

已知局限：Vditor 的「关于」面板硬编码了 `https://unpkg.com/vditor/dist/images/logo.png`（不走 cdn 选项，改不了），纯离线环境下该 logo 是裂图。


## 主题（浅色 / 暗黑 / 自适应）

前台和后台都支持 `auto`（跟随系统）/ `light` / `dark` 三种模式，共用同一套机制。实现分散在 5 个地方，改主题相关的东西前先看这张表：

| 位置 | 职责 |
|---|---|
| `web/home.html`、`web/admin.html` | **首屏防闪 + 首屏标题**：`<head>` 里的内联脚本在解析 `<body>` 之前就写好 `data-theme` / `data-theme-mode` / `html.dark`，并把没被替换的 `__MENOTE_SITENAME__` 兜底成默认名。两份内容必须一致 |
| `lib/theme.js`（服务端） | **外壳注入**：读站点默认主题 + 站点名（同一个 5 秒内存缓存，`getShellVars()`），替换外壳里的 `__MENOTE_THEME__` / `__MENOTE_SITENAME__` 占位符（`inject()`）。站点名进 `<title>` 前会转义 |
| `web/src/shared/theme.js`（前端） | `applyTheme` / `setThemeMode` / `cycleThemeMode` / `previewTheme` / `initTheme` / `syncFromSite` + 两个 ref |
| `web/src/home/styles/home.css` | 前台令牌：`:root` 浅色 + `[data-theme="dark"]` 暗色 |
| `web/src/admin/styles/admin.css` | 后台**只**覆盖 Element Plus 的 `--el-color-primary` 系列和几个中性底色 |

### 优先级

```
localStorage['menote-theme']  >  站点默认（后台「站点设置」的 theme）  >  auto
```

- 访客点头部（前台）/ 侧栏底部（后台）的图标按钮 → 依次轮换 auto → light → dark → auto，并写进 localStorage，此后不再跟随站点默认
- 站点默认存在 `menote_site` 表 `key='theme'`。老库没有这一行时由 `app/api/controller/site.js` 的 `get()` 幂等补行（`model/site.js` 的 `ensureConfig`），不必手动执行 SQL
- 保存设置时会校验取值合法性并清掉 `lib/theme.js` 的缓存，管理员刷新即见效

### 为什么不用纯 CSS 的 `@media (prefers-color-scheme: dark)`

纯媒体查询能做到零 JS 自适应，但表达不了「用户手动选了浅色、系统却是暗色」——媒体查询不认用户的显式偏好。改用 `<html>` 属性 + 首屏脚本后，浅/暗各写一套令牌就行，顺带把 Element Plus 认的 `html.dark` 一起管了。

### 四个容易踩的坑

1. **Element Plus 的暗色变量会重定义 `--el-color-primary` 系列**（`element-plus/theme-chalk/dark/css-vars.css`，挂在 `html.dark` 下，必须在 `main.js` 里显式 import——它属于 opt-in）。只改 `:root` 的话，切到暗色 primary 会变回默认蓝 `#409eff`。所以 `admin.css` 里 **`:root` 和 `html.dark` 两套都要写**。
2. **`--el-color-primary-rgb` 在暗色下不会被 Element Plus 覆盖**（它自己的暗色文件里漏了这条），必须自己补，否则 `rgba(var(--el-color-primary-rgb), …)` 的地方还留着旧的蓝色分量。
3. **canvas 里读不到 CSS 变量**。`GraphView.vue` 用 `getComputedStyle(document.documentElement).getPropertyValue('--accent')` 运行时取值，并 `watch(resolvedTheme)` 逐项 `DataSet.update` 重绘——**不要重建 Network**，那会把物理布局的落点重置，整张图会跳一下。另外 vis-network 把节点 label 画在节点**下方**（画布底色上），字号颜色要对 `--text` 而不是节点填充色。
4. **Vditor 的语法高亮配色是渲染时按 `hljs.style` 动态挂 `<link>` 的**，token 颜色写死在 CSS 里，换 CSS 变量救不了。`NoteView.vue` 按当前主题在 `github` / `github-dark` 之间切（自托管目录里只有 github 系三套，见 `web/vendor-vditor.mjs` 的 `CODE_THEMES`），并在主题变化时重渲染。

### 色板来源与生成规则

品牌色取自 Android 端 `colors.xml`：薄荷 `#76CCB5` 是 logo 底色，`m3_primary` `#00695C` 是深青。

- 前台浅色态用**深青 `#00796b`** 做链接和实底按钮（薄荷压浅底只有 1.9:1，读不了），薄荷只做点缀（logo、卡片 hover 竖线的渐变上端）
- 前台暗色态反过来：`--accent` 换成薄荷（压在 `#0f1716` 上是 9.6:1），实底按钮上的前景色改用 `--accent-on`（浅色=白 / 暗色=近黑）
- 后台浅色 `#00796b`；暗色 `#1d887c`——在「白字压实底按钮」4.32:1 与「主色当文字压暗底」4.27:1 之间取的平衡点
- Element Plus 色阶按它自己的公式生成：
  - 浅色：`light-N = mix(#fff, primary, N*10%)`、`dark-2 = mix(#000, primary, 80%)`
  - 暗色：`light-3/5/7/8/9 = mix(#141414, primary, 70%/50%/30%/20%/10%)`、`dark-2 = mix(primary, #fff, 20%)`
  - ⚠️ **暗色态 light-N 的混色方向与浅色态相反**，照抄浅色公式会算反
- 所有前景/背景组合都过过 WCAG AA（正文 ≥ 7:1，小字与链接 ≥ 4.5:1）。薄荷色系特别容易在浅底上翻车，**改色值后请重新复核，别凭手感调**

### 回归测试

`npm run test:smoke` 的第 6 组专门覆盖主题：本机选浅色/暗黑、系统偏好两个方向的自适应、切换按钮的轮换与持久化。判据取的是 `data-theme` 属性 **加上** `body` 算出来的实际背景色——只看属性证明不了 CSS 令牌真的生效。


## 关键约定

### 1. 改完代码不直接提交 git
改完停在未提交状态，汇报改动等待用户审查。用户明确说"提交"才提交。

### 2. 前后台都是 SFC，不再有"忘 return"问题
2026-09-23 起后台与前台都已迁到 Vite + SFC（`<script setup>` 自动暴露绑定），原先"`setup()` 未 return 导致整棵子树白屏"的坑从根上消失。

**历史案例（迁移前）**：2026-09-07 适配手机端时 `NoteEditor` 引用 `store.isMobile` 忘 return `store`，导致编辑器全白，控制台报 `Cannot read properties of undefined (reading 'isMobile')`。

**现在的等价陷阱**：改用 `<script setup>` 后，模板里用到的变量必须在 `<script setup>` 顶层有定义或 import——漏 import 会是同样的白屏症状。

**排查方法**：生产构建里 Vue 不会输出 "Failed to resolve component" 警告（dev-only），未注册/未 import 的东西会以原生自定义元素原样留在 DOM 里。所以「DOM 里出现 `el-` / `router-` / `view-` 前缀的标签」基本就等于组件没解析。`npm run test:smoke` 内置了这条判据。

### 3. 签名密钥绝不进 git
- `android/menote-p2p.jks` 已用 `git filter-repo` 从历史抹除并 force push
- `keystore.properties`（含密码）从未提交
- 根/Android `.gitignore` 已挡住 `.jks`
- 开源仓库不放 release 签名密钥——社区构建用自建密钥

### 4. 测 API 必须带 AJAX 特征
jj.js 检测非 AJAX 请求时不返回 JSON 而渲染 HTML 页面。用 PowerShell `Invoke-WebRequest` 直接打 `/api/*` 拿到 HTML 属正常框架行为，不是路由/代理故障。

**正确做法**：加 `X-Requested-With: XMLHttpRequest` 头。

### 5. P2P 新代码一律走 `lib/p2p.js`
旧 `p2p/` 目录已于 2026-09-11 被用户删除，不再存在。

### 6. jj.js 测试脚本必须放项目根跑
jj.js 的 `base_dir = require.main.path`：测试脚本必须放在 `D:\wwwroot\zzz\menote` 根下跑（用 `.tmp.cjs` 命名，用完删），否则 config/app/model 全部加载不到 → 404。

npm 必须用 `npm.cmd`（PowerShell 5.1 执行策略禁 `npm.ps1`，报 "running scripts is disabled"）。

### 7. `update_time` 兼任乐观锁版本基准
`/api/note/edit` 携带的 `update_time` 与库中不一致即拒绝保存（返回 `data.conflict:true`）。

**新加任何写 `menote_note` 的路径都要遵守**：
- **只在用户编辑内容时刷新 `update_time`**，pin/sort 等元数据操作不刷（否则别处编辑会产生虚假冲突）
- `saveNote` 更新分支返回新 `update_time`，调用方须用它刷新本地基准
- admin 前端冲突处理：`store.conflictDialogVisible` / `reloadAfterConflict()`（原地替换 `notesCache[id]` 不清缓存，防 Vditor 白屏）

### 8. 删除笔记时同步清理附件
删除笔记时在事务里同步删 `attach` 表记录，事务提交后物理删磁盘文件。

**三级判断**（只在前两级都无引用时才物理删文件）：
1. `attach` 表还有别的记录指向同路径 → 仅删记录，保留文件
2. 其他笔记正文 `LIKE '%filepath%'` → 仅删记录，保留文件
3. 都没引用 → 物理 `unlink` 磁盘文件

每次跳过都 `$logger.info` 记一条，方便事后查为什么某个文件没删。

**实现细节**：
- 扫描放在事务提交之后（本笔记的 attach 行已删，查到的一定是别的笔记在引用）
- 用 `LIKE` 而不是 `exp` 拼接（参数绑定标准，误判方向永远是"多保留"而不是"误删除"）
- 全文路径匹配能覆盖 URL 变体（`![](/upload/xxx.png)`、`http://域名/upload/xxx.png`、纯文本）

**已知局限**：
- 只扫 `content` 字段，不扫 `title`/`keywords`
- `note` 表正文没法建索引，每次删笔记都做的全文线性扫描（笔记量上千后单次删除会稍慢）

## jj.js 框架要点

- npm 包 `jj.js@1.1.1`，Koa 3 子类：`App extends Koa`，`app.listen()` 就是 `http.createServer(app.callback())`
- 路由：`config/routes.js` 显式条目 + 约定式 `/api/<controller>/<action>` 自动映射到 `app/api/controller/<ctrl>.js` 的方法
- cookie 签名默认开启（`keys: ['jj.js']`）——测试伪造 cookie 没用，直接走登录或测模型层
- `data/menote.db` 表全部 `menote_` 前缀（`menote_user`/`menote_note`/`menote_cate`/`menote_site`/`menote_token`/`menote_attach`/`menote_note_link`）
- `lib/` 不在框架自动加载范围，`server.js` 手动 require

## SPA 改动模式（前后台共用套路）

### 目录结构
```
web/src/admin/            # 后台（hash 路由，引 Element Plus）
├── main.js              # 入口：createApp + Element Plus 按需注册 + 全局图标注册
├── App.vue              # el-config-provider(zhCn) + <router-view/>
├── api/index.js         # request() 统一请求封装 + api 对象（export）
├── store/index.js       # 全局 reactive store（export store，未用 Pinia）
├── router/index.js      # hash 路由，全部懒加载
├── permissions.js       # TOKEN_PERM_GROUPS
├── components/          # CategoryTree / NoteList / NoteEditor
│                        # NoteEditor 由 Workspace.vue 用 defineAsyncComponent 再拆一层
│                        # （Vditor 291kB 不进首屏），Vditor 的 CSS 与针对它的覆盖规则
│                        # 都放在这个文件内，理由见下节
├── views/               # Workspace / SiteSettings / TokenManage / UserProfile / P2pManage / GraphView
└── styles/admin.css     # 主题令牌 + Element Plus 全局覆盖 + 跨页面共享类
                         # + 末尾混装的移动端媒体查询块（页面私有样式在各 .vue 里）

web/src/home/             # 前台（history 路由，不引 Element Plus）
├── main.js / App.vue    # 入口 + header/nav/搜索/footer 布局
│                        # nav 渲染的是 flattenCates(cates, true) 拍平后的**全部层级**，
│                        # 只渲染顶层的话二级分类在导航里看不到；depth>0 加 .is-child 走次级样式
├── api/index.js         # 全走 /api/pub/*
├── store/index.js       # reactive + init() + setTitle()
├── router/index.js      # history 路由，5 条全懒加载
├── utils/index.js       # formatTime / splitTags / flattenCates（第二参 withDepth）
├── components/          # NoteList（首页/分类/搜索三页共用，prop 控制元信息）
│                        # 内部用 computed 把 formatTime/splitTags 预算成 time/tags 字段，
│                        # 模板里不再重复调用（v-if 判一次、插值/v-for 再算一次的写法已去掉）
├── views/               # HomeView / CateView / SearchView / NoteView / GraphView
└── styles/home.css      # 从旧 public/static/app/style.css 迁移，类名不变
```

### 后台首屏体积：两条懒加载线

`Workspace` 是 `/admin` 的默认路由，所以**路由级懒加载挡不住它内部的依赖**。两个重依赖要各拆一次：

| 依赖 | 拆法 | 首屏省下（gzip） |
|---|---|---|
| vis-network（615 kB） | 天然隔离：只有 `GraphView` 这个路由用 | 149 kB |
| Vditor（291 kB JS + 40 kB CSS） | `Workspace.vue` 里 `defineAsyncComponent(() => import('@/admin/components/NoteEditor.vue'))` + `<Suspense>` 兜底 | 79 kB |

**Vditor 的 CSS 必须跟组件走，不能留在 `main.js` 的入口样式区**：

- 入口样式表永远先于懒加载 chunk 的 CSS 被应用。`NoteEditor.vue` 末尾的 `<style>` 块里有一批覆盖 Vditor 自带样式的规则（暗色变量、代码块底色、工具栏），留在 `admin.css` 的话会被后加载的 Vditor 基础样式盖回去
- 反过来，把 `import 'vditor/dist/index.css'` 放进 `NoteEditor.vue`、覆盖规则放同文件的 `<style>`，构建后 Vite 会按模块图顺序拼进同一个 chunk CSS，顺序天然正确。**可以自查**：产物 `Workspace.*.js` 里的 `__vite__mapDeps` 数组，`vendor-vditor.*.css` 的下标必须小于 `NoteEditor.*.css`
- 该 `<style>` 块**不能加 `scoped`**：Vditor 的 DOM 是 JS 运行时插进 `#vditor` 的，没有 SFC 的 scope 属性，`scoped` 会编译成 `.vditor[data-v-xxx]` 而匹配不到

### 样式放哪里：页面私有样式进 SFC（2026-09-24）

`admin.css` 从 1918 行收到 1462 行，5 个页面级分节（站点设置 / Token / 账户 / 图谱 / P2P，共 267 行）连同它们各自的移动端覆盖搬进了对应 `.vue` 的 `<style>` 块。判断标准就一条：**这个选择器只被一个组件用 → 进那个组件**。

分界线：

| 放哪 | 内容 |
|---|---|
| 组件内 `<style>` | 组件私有类名（`.p2p-*`、`.settings-*`、`.token-*`、`.profile-*`、`.graph-*`）+ 它们自己的 `@media`；第三方组件集成样式（Vditor 那套，见上节） |
| `admin.css` | 主题令牌（`:root` / `html.dark`）、Element Plus 全局覆盖（紧凑模式、`.el-form-item`、`.el-dialog` 等）、跨页面共享类（`.page-header*`、`.table-scroll-wrapper`、`.workspace*`、`.note-item*`）、以及**末尾那个混装的移动端媒体查询块** |

三条硬规则：

1. **不要加 `scoped`。** scoped 会把 `.p2p-page` 编译成 `.p2p-page[data-v-x]`，特异性从 (0,1,0) 抬到 (0,2,0)，admin.css 里给所有页面准备的共享规则（`.el-form-item` 的紧凑间距、`.el-container` 的高度等）就挤不过它了。类名是单组件独占的，不存在外泄问题
2. **移动端覆盖必须跟着一起搬。** `admin.css` 末尾那个 `@media (max-width: 768px)` 块里有各页的覆盖（`.p2p-manual-row{flex-direction:column}` 之类）。只搬桌面规则不搬它，移动端就废了：非 scoped 的组件样式随 chunk 后加载、会排在 admin.css 的 `@media` 之后，同特异性下后者被盖掉
3. **保持"桌面在前、`@media` 在后"的原始顺序**，层叠结果才与搬运前一致

搬完后用 CDP 抓了 24 组快照（6 个页面 × 桌面/移动 × 浅色/暗色）逐元素比对计算样式，**属性差异 0 处**。以后做同类重构可以复用这套办法：抓全量元素的计算样式快照 → 改 → 再抓 → LCS 对齐后逐属性 diff。注意别按"文档顺序下标"硬比：`el-select` 的下拉 popper 是首次展开才渲染的、Vditor 是渐进渲染的，元素个数会抖；另外 `document.body.querySelectorAll('*')` 取不到 `<html>` / `<body>` 自己。

### 加新页面流程（以 admin 为例）
1. 在 `views/` 写 `Xxx.vue`（`<template>` + `<script setup>`）
2. `router/index.js` 加 `{path: '/admin/xxx', component: () => import(...)}`（懒加载）
3. 侧栏 `tree-footer-actions` 加入口按钮
4. 页面私有样式直接写在 `Xxx.vue` 的 `<style>` 块里（**不加 `scoped`**，含该页自己的 `@media`）；只有跨页面共享的、Element Plus 全局覆盖的、以及主题令牌才加进 `styles/admin.css`
   （例外：被懒加载的第三方组件——如 Vditor——的样式同样写在组件内，见"后台首屏体积"一节）
5. `npm run build`（产物名带 hash，无需再手工 bump `?v=`）

前台同理，但**多一步**：若新增的是**顶级 URL**（如 `/tag/:name`），必须同时在 `config/routes.js` 加服务端路由指向某个薄壳控制器，否则直接访问/刷新会 404（见"前台 SPA 架构"）。

### 移动端架构（≤768px 单栏视图栈）
- `store.isMobile` / `mobileView('list'|'editor')` / `mobileSidebarOpen`
- 编辑器与列表互斥全屏，顶栏返回键由 `mobileView` 驱动
- 操作按钮触屏常显，Vditor 工具栏横滚
- 弹窗 `92vw`，设置/Token 页有返回键

改布局前先读 `styles/admin.css` 末尾的移动端媒体查询块。

## API 认证两级

- **admin 后台**：cookie `user`（auth middleware / Base._init 查 `menote_user` 表）
- **外部 API**：`?token=` 或 `Authorization: Bearer`，权限映射在 `app/api/controller/base.js` 的 `PERM_MAP`
- `p2p.js` 控制器只认 cookie（P2P 管理不开放 token）

## P2P 架构详情

### 链路
```
手机 WebView → 127.0.0.1:8080 (Android 本地代理)
  → iroh QUIC (ALPN: menote-p2p/1, NAT 打洞/中继)
  → 电脑 lib/p2p.js (Endpoint, 白名单校验 remoteId)
  → BiStream → Duplex shim → http.createServer(koaCallback).emit('connection', shim)
  → jj.js 完整栈（路由/cookie/静态/上传）
```

### lib/p2p.js
- 依赖：官方 `@number0/iroh@1.1.0`（NAPI-RS，win32-x64 二进制 OK）+ `qrcode`
- 启动：`server.js` 的 listen 回调里 `require('./lib/p2p').init(app)`；iroh 未装/绑定失败只 log 不崩主服务
- 身份：`data/p2p-key.bin`（32 字节 SecretKey）→ 节点 ID 恒定；白名单 `data/p2p-allow.json`
- 安全：QUIC 握手层 remoteId（Ed25519 公钥不可伪造）对白名单；jj.js 原有登录认证照常
- 配对：未配对节点连接 → `pendingPairings` 记录（30s/节点限流，≤20 条）→ admin 轮询弹授权 → `authorizePeer` 写白名单 → 手机自动重连
- API：`app/api/controller/p2p.js` → `/api/p2p/{status,qrcode,authorize,dismiss,add,remove}`（cookie 认证）。ID 校验：base32 52 字符或 hex 64
- 前端：`P2pManage` 组件（`/admin/p2p` 路由），3s 轮询 status，新 pending 自动弹授权窗

### BiStream→Duplex shim 四个坑
1. `httpServer.httpAllowHalfOpen = true` **必须**——客户端 FIN（push null）后 Koa 异步写响应，否则 `socketOnEnd` 调 `socket.end()` 掐断写侧，症状=收到请求但响应永远空
2. shim 补 `net.Socket` 形状：`setNoDelay`/`setKeepAlive`/`setTimeout`（no-op）、`destroySoon`（=end()）、`server` 属性、`remoteAddress`/`remotePort` getter（`p2p:<peerId>`）
3. 数据方向：**请求字节走 `shim.push()`（readable 侧），响应从 `shim.write()` 回调收**——与 socket 直觉相反
4. `BiStream.send` / `BiStream.recv` 是 **getter 属性**（d.ts 标注 `get send()`），不是方法；`recv.read(n)` 返回 `Array<number>`，空数组=EOF；`send.writeAll(Array.from(buf))` + `finish()`

### @number0/iroh 1.1.0 API 速记
- `Endpoint.bind({secretKey, alpns:[[bytes]]}, RelayMode.defaultMode())` → **`ep.id().toString()` 返回 hex(64)，不是 base32**。base32(52) 需自己转（`toBase32Id`，RFC4648 小写无 padding）；`EndpointId.fromString()` 两种编码都接受
- `ep.acceptNext()` 拉取式（非回调），返回 `Incoming | null`（null=endpoint 关闭）→ `incoming.accept()` → `Accepting.connect()` → `Connection`
- `conn.acceptBi()` 循环收双向流；`conn.remoteId().toString()` 是对端节点 ID（hex）；`conn.closed()` Promise 断开通知
- `EndpointId.fromString(id)` + `new EndpointAddr(idObj, null, [])` 构造对端地址；`ep.connect(addr, ALPN)`
- 全部 async/await，读写单位 `Array<number>`，无 Node Buffer/WebStreams

### 节点 ID 编码统一（全链路 base32）
服务端 `toBase32Id()`（`lib/p2p.js` 导出）在五个入口归一——`nodeId`、`handleIncoming` 的 remoteId、`authorizePeer`/`removePeer`/`dismissPairing`/`recordPairingRequest`、控制器 `authorize`/`add`/`remove`/`dismiss`、`loadAllow`（旧 hex 数据自动归一并回写）。

admin 显示：本节点 ID 主显前 10 位短 ID（`shortNodeId` computed），「完整 ID ▼」展开；白名单表格列短 ID + tooltip 完整。

### Android 端要点
- `IrohProxy.kt`：本地 ServerSocket 8080 → 每请求一条 QUIC Bi 流；`HttpCodec`（io.ktor-http 3.5.2 纯数据结构）做解析/生成
- **`buildRequest` 必须跳过 Connection/Content-Length/Transfer-Encoding 三个头自己生成**——透传 WebView 自带的 Content-Length 会造成双 CL 头，Node HTTP parser 直接 400，症状=POST 全挂
- **重连退避**：`connAttemptsSinceSuccess` 计数 → `retryBackoffMs()` 5s→10s→20s→40s→60s 封顶；watchdog 按「连接存活是否 >30s」区分正常断线（重置计数）与握手即断（未配对，累加退避）
- `ScanActivity.kt`：zxing-core PlanarYUVLuminanceSource + CameraX ImageAnalysis；结果 hex(64) 自动转 base32(52) 回填输入框并存 pref
- `WebActivity.kt`：cookie 修复 = `CookieManager.flush()` 三时机（onPageFinished/onPause/onDestroy）；文件上传 = `onShowFileChooser` 桥（默认 WebChromeClient 不实现文件选择，编辑器上传点击无反应的根因）
- 登录态机制：cookie 作用域是域不是端口——`127.0.0.1:8080` 与 `127.0.0.1:3107` 对 cookie 是同一站点，换端口登录态照常带
- **系统栏安全区（2026-09-24 修）**：`targetSdk = 35` 起 Android 15+ **强制 edge-to-edge**，窗口铺满全屏、状态栏透明悬浮，内容默认钻到状态栏底下——症状是新机型上标题行/按钮/后台顶部 mobile-header 被状态栏盖住点不到。Android 16 起 `windowOptOutEdgeToEdgeEnforcement` 逃生舱被移除，只能正面适配。
  做法：三个 Activity 都先 `enableEdgeToEdge()`，再用 `Insets.kt` 的 `View.applySystemBarPadding()` 把 `systemBars() or displayCutout()` 的 inset **加在原有 padding 之上**（`MainActivity` 给根布局、`WebActivity` 给包住 WebView 的 FrameLayout、`ScanActivity` 只给提示文字以保住全屏相机预览）。listener 里必须原样 `return insets` 不 consume。
  两个要点：① WebView 场景用**外层容器 padding**（不是给 WebView 设 padding），这样 SPA 的 `100vh` 自动等于安全区高度，**页面侧零改动、不需要 `env(safe-area-inset-*)`**；② `ScanActivity` 用 `SystemBarStyle.dark(TRANSPARENT)` 固定浅色系统栏图标，因为相机预览恒为深色，跟随系统浅色主题会出现黑图标盖黑画面。
  两个配套项别漏：① `horizontal = true`——横屏时刘海在侧边、三键导航栏跑到右侧，只避让上下不够；竖屏下这两个方向的 inset 恒为 0 所以无副作用。② **`ime = true` + manifest 的 `windowSoftInputMode="adjustResize"`**——`enableEdgeToEdge()` 关掉了 decorFitsSystemWindows，窗口不再随键盘自动缩小，不显式消费 `ime()` inset 的话键盘会盖住 WebView 里的编辑器和配置页日志面板（**这是开启 edge-to-edge 后相对旧版本新增的回归，Android 14 及以下同样中招**）。
  **新增 Activity 别忘了这一套**，否则同样中招。

### 测试隔离（必须遵守）
**测 P2P 一律用 `P2P.init(app, {dataDir: 临时目录})`**（v1.8 后支持）——之前测试脚本直接跑、清理代码误删了真实 `data/p2p-key.bin`/`p2p-allow.json`，导致用户已配对数据丢失。教训：涉及真实数据文件的测试，永远先设隔离目录再跑。

`shutdown()` 现在会自动 `saveAllow()` 落盘（内存态同步到文件）。

**改生产路径必须与测试隔离参数分开写**：v1.8 测试隔离改版时把生产 `KEY_FILE`/`ALLOW_FILE` 也拼到了 `BASE_DIR` 根（丢掉 `data/` 子目录）——服务重启后密钥写到了项目根 `p2p-key.bin`，已在 init 里加杂散文件自动迁移回 `data/`（两边都有时 `data/` 优先）。

**节点 ID ≠ 私钥**：调试时算「当前进程的节点 ID」要用 `SecretKey.fromBytes(keyBytes).public().toString()`（公钥 hex）→ `toBase32Id`，直接拿 32 字节密钥文件内容转 base32 是错的（`fromString` 会报 "not a valid public key"，这是正确报错不是 bug）。

**密钥文件丢失/更换后手机必连不上且服务端无任何反应**（旧 ID 在 P2P 网络找不到节点，连接到不了服务端，连"未配对拒绝"都不会发生）——排查「连不上且无授权弹窗」先核对服务端控制台打印的 ID 与手机输入的 ID 是否同一个。

## 开发注意事项

### 服务器重启
3107 端口服务由用户经宝塔启动（`D:\BtSoft\nodejs\nodejs\node.exe .\server.js`），非 agent 启动。改后端代码前先确认要不要重启，按下面这张表判断（**2026-09-24 实测修正**，原来说的"一律要重启"不准确）：

| 改动位置 | dev（`npm run dev`，NODE_ENV=development） | 生产（`npm start`） |
|---|---|---|
| `app/**`（控制器、模型） | **自动重载，无需重启** | 需重启 |
| `lib/**`、`config/**`、`server.js` | 需重启 | 需重启 |
| `public/**`（含构建产物） | 改盘即生效 | 改盘即生效 |

原因：`config/app.js` 的 `app_debug` 打开时，`jj.js/lib/app.js:110` 会调 `types.watch()` 起一个文件监听（本意是自动生成 `types.js`），而它的 `createFile()` 里顺带 `delete require.cache[变更文件]`（`lib/types.js:106`）——于是 `app/` 下的控制器和模型被重新 require 时就拿到了新代码。**这是监听器的副作用，不是 jj.js 承诺的 HMR**，且只覆盖 `app/` 目录，别把它当热更新用。

改前端（`web/`）后必须 `npm run build`，产物名带 hash 无需手工 bump 版本参数。

### Android 构建
```powershell
$env:JAVA_HOME = "D:\Program Files\Java\jdk-20"
cd D:\wwwroot\zzz\menote\android
.\gradlew.bat assembleRelease --no-daemon    # ~90s；只验编译用 compileDebugKotlin
```

输出 `app\build\outputs\apk\release\app-release.apk` → **一键脚本：`android\build-apk.bat`**（设 JDK20 → assembleRelease → 自动读 versionName 复制为 `MeNote-vX.Y-arm64.apk` 到 android 目录根）。

发版改 `app/build.gradle.kts` 的 `versionCode`/`versionName` 同步升。

签名自动读 android 目录下 `keystore.properties`（指向 `menote-p2p.jks`，已 gitignore），无需手动参数。

### Android 界面改动怎么验证（本机可跑模拟器）
本机 SDK 已有 4 个 AVD：`Pixel_6` / `Pixel_8a_API_35`（均 API 35）、`Pixel_6_2`（API 31）。**API 35 正好是强制 edge-to-edge 的场景**，改窗口/inset/布局类代码一定要在它上面过一遍，别只看编译通过。

```bash
# 1. 正式包只有 arm64-v8a，模拟器是 x86_64 装不上 —— 临时把 abiFilters 加上 x86_64
#    （iroh 与 jna 的 aar 都自带 x86_64 .so，所以能真跑），走 assembleDebug 更快
#    改 build.gradle.kts → ndk { abiFilters += listOf("arm64-v8a", "x86_64") }
#    ★ 验完必须改回只留 arm64-v8a 并重新 assembleRelease，否则 APK 白胖 7MB

# 2. 起模拟器（无窗口 + 软件渲染，服务器环境最稳）
emulator.exe -avd Pixel_6 -no-snapshot -no-boot-anim -no-audio -no-window -gpu swiftshader_indirect
adb wait-for-device   # 之后轮询 getprop sys.boot_completed 等 1

# 3. 装 + 跑（先 grant，否则权限弹窗挡住界面）
adb install -r -t app/build/outputs/apk/debug/app-debug.apk
adb shell pm grant com.menote.p2p android.permission.POST_NOTIFICATIONS
adb shell am start -n com.menote.p2p/.MainActivity

# 4. 量几何（别靠肉眼看截图）
adb shell uiautomator dump /sdcard/ui.xml && adb pull /sdcard/ui.xml .
adb shell dumpsys window | grep -E "type=(statusBars|navigationBars|ime)"
```

坑：
- **模拟器自带蓝牙会反复崩**，弹框挡住界面 → `adb shell settings put global hide_error_dialogs 1`（验完记得改回 0，设置会存进 AVD 的 userdata）
- **`WebActivity` / `ScanActivity` 都是 `exported="false"`，`am start` 起不来**（SecurityException）→ 只能走 UI：`adb shell input tap x y` + `adb shell input text ...`
- **uiautomator 第一次 dump 可能拿到 inset 还没重排完的中间态**（底部 padding 会少一截，看着像没生效），**多 dump 一次再下结论**
- 参照值：Pixel 6 API 35 密度 420 → 16dp = 42px、状态栏 128px、手势导航栏 63px

2026-09-24 在 Pixel 6 / API 35 上的实测基线（修完 inset 后应当长这样）：

| 界面 | 控件 | 实测 bounds | 说明 |
|---|---|---|---|
| `MainActivity` | `@id/root` | `[0,0][1080,2400]` | 根布局仍铺满全屏（edge-to-edge 生效） |
| `MainActivity` | 标题 `MeNote` | `[42,170]…` | 170 = 42(16dp) + 128(状态栏) ✓ |
| `MainActivity` | `@id/logScroll` | `…[1038,2295]` | 2295 = 2400 − 42 − 63(导航栏) ✓ |
| `WebActivity` | `WebView` | `[0,128][1080,2337]` | 视口恰好等于安全区 → SPA 的 `100vh` 正确 |
| `ScanActivity` | 提示文字 | 文字基线在状态栏下方 | 相机预览仍全屏（黑底 + 浅色系统栏图标） |

**API 31（`Pixel_6_2`，3 键导航）实测**——几何与 API 35 不同，别拿一套数字套两个版本：

| 量 | API 35（手势导航） | API 31（3 键导航） |
|---|---|---|
| 状态栏 | 128px（48.8dp，含挖孔） | **63px（24dp）** |
| 导航栏 | 63px（24dp） | **126px（48dp）** |
| 标题 `MeNote` top | 170 = 42 + 128 | **105 = 42 + 63** |
| `logScroll` bottom | 2295 = 2400 − 42 − 63 | **2232 = 2400 − 42 − 126** |
| 键盘弹出后 `logScroll` bottom | — | **1491 = 2400 − 42 − 867** |

两个新坑：
- **API 31 的 `uiautomator` 会把根布局 bounds 裁到"可见区"**（报 `[0,0][1080,2274]` 而不是真实的 2400）→ 别据此以为窗口没铺满；用**子 View 的位置**反推 padding 才靠谱
- **IME inset 有两个不同的数**：`ime()` 给的是 IME 完整 frame 高度（867），而 `dumpsys` 里的 `mImeHeight` 是 741。消费 `ime()` 时以 867 为准（键盘顶边 = 2400 − 867 = 1533，日志区底边 1491 = 1533 − 42，正好压在键盘上方 16dp）

**关于 ANR 的结论（2026-09-24 查清）**：模拟器上看到过 `MeNote isn't responding`，读 `/data/anr/` 的 trace（需先 `adb root`，google_apis 镜像可以）后确认 **7 份 ANR 全是 SystemUI / GMS / LatinIME / 蓝牙 这些系统应用，`grep com.menote.p2p` 命中 0**——是慢速模拟器的通病，不是 App 缺陷。App 侧也本来就干净：`IrohProxy.start()` 全程跑在 `Dispatchers.IO`，主线程只做 `startForeground` 和建通知。

### 系统环境
- Windows + PowerShell 5.1：无 `&&`（用 `;`）；写文件勿用 `Set-Content`/`>`（ANSI/UTF-16 编码坑），一律用 octo `write_file`/`edit_file`
- `tar.exe` 可用（解压 npm tarball 等）
- `Invoke-WebRequest` 访问 maven.org/npmjs 偶发 TLS EOF，包一层 1..3 重试即可成功
- 时区 CST (UTC+8)

### 飞牛 FPK 打包
飞牛 fnOS 应用市场格式。目录结构：

```
fpk/
├── manifest              # 应用元信息（appname/version/display_name/desc/maintainer 等）
├── ICON.PNG              # 64px 应用图标
├── ICON_256.PNG          # 256px 应用图标
├── README.md             # FPK 打包说明（安装方法、数据存储位置、常见问题）
├── app/
│   ├── docker/docker-compose.yaml   # 容器编排（端口/卷映射从 wizard 变量读取）
│   └── ui/                          # 应用中心 UI 配置（config + images/）
├── cmd/                  # 生命周期钩子（bash 脚本）
│   ├── install_init      # 安装前
│   ├── install_callback  # 安装后
│   ├── uninstall_init    # 卸载前
│   ├── uninstall_callback # 卸载后
│   ├── upgrade_init      # 升级前
│   ├── upgrade_callback  # 升级后
│   ├── config_init       # 配置初始化
│   ├── config_callback   # 配置回调
│   └── main              # start/stop/status 入口（检查 docker 容器状态）
├── config/
│   ├── resource          # 声明 docker 项目 + 共享目录（menote）
│   └── privilege         # 权限配置
└── wizard/install        # 安装向导 JSON（让用户输入端口，默认 3107）
```

**打包命令**：
```bash
cd fpk
fnpack build    # 生成 menote.fpk
```

**数据存储**：容器卷映射到飞牛共享目录 `menote/`（文件管理器可见）：
- `menote/data/` — SQLite 数据库、P2P 节点密钥、配对白名单
- `menote/upload/` — 笔记附件

**关键变量**（wizard/install 定义，docker-compose.yaml 引用）：
- `wizard_panel_port` — 对外端口（默认 3107）
- `TRIM_DATA_SHARE_PATHS` — 飞牛注入的共享目录路径前缀

**注意事项**：
- 容器重建不会更换节点 ID（密钥在数据卷中），手机端无需重新配对
- `config/lock.js` 必须排除（否则新用户进不了安装向导）
- `data/` 和 `public/upload/` 必须在 `docker/Dockerfile.dockerignore` 排除
  （⚠️ 文件名不能改成 `docker/.dockerignore`：Docker 只认「上下文根目录的 `.dockerignore`」或「与 Dockerfile 同目录、以 Dockerfile 名为前缀的 `Dockerfile.dockerignore`」，子目录里的裸 `.dockerignore` 会被静默忽略，过滤失效后构建上下文从 ~30MB 涨回 ~800MB）

## 常见陷阱

1. **SFC 模板里用了没 import / 没定义的变量** → 整棵子树渲染中断（迁移前的等价形态是"`setup()` 忘 return"，见"关键约定 2"）
2. **测 API 没带 AJAX 头** → 拿到 HTML 而不是 JSON（误以为是路由故障）
3. **测试脚本没放项目根** → config/app/model 全部加载不到，404
4. **P2P 测试没设隔离目录** → 误删真实密钥/白名单，已配对数据丢失
5. **改 `update_time` 逻辑时没区分编辑 vs 元数据操作** → 别处编辑产生虚假冲突
6. **删笔记时没同步清理附件** → `attach` 表孤儿数据 + 磁盘文件泄漏
7. **Android 端 `buildRequest` 透传 Content-Length** → 双 CL 头，POST 全挂
8. **节点 ID 编码混用** → 白名单 key 与查询 key 不一致，已授权节点 403
9. **改了 `web/` 没 `npm run build`** → 页面还是旧产物（hash 没变，浏览器也未必重取）
10. **动了 `app/app/controller/*` 或 `config/routes.js` 的前台路由** → history 路由下直接访问/刷新即 404，`npm run test:smoke` 第 1 组用例专门盯这个
11. **jj.js 的 `where(where, logic)` 只接受对象条件** → 传 `where('(sql...)', [params], 'or')` 会被静默丢弃（第三个参数不存在），落到 `logic` 上后报 `item[1].toLowerCase is not a function`
12. **多条件 OR 查询的顺序** → jj.js 只给**第一个** `where()` 自动加括号。`where({is_public:1}).where({title like}).where({content like,'or'})` 生成的是 `is_public=? AND title LIKE ? OR content LIKE ? OR ...`，因 AND 优先级高于 OR，**会把私密数据搜出来**。含 OR 的组必须整体放在第一个 `where()` 里

## 许可证

MIT License — 详见 [LICENSE](LICENSE)

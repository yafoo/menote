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
- **框架**：Vue 3（运行时编译模板，无构建步骤）
- **UI**：Element Plus
- **编辑器**：Vditor
- **图谱**：vis-network
- **admin SPA**：单文件 `public/static/admin/admin.js`

### Android 端
- **工程路径**：`android/`（包名 `com.menote.p2p`，当前 v2.3 = versionCode 13）
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
│   ├── admin/             # 后台：controller/{index,login}.js + middleware/auth.js + view/*.htm
│   ├── api/controller/    # REST API：base.js（cookie 或 Bearer token 认证基类）、note/cate/search/graph/site/token/user/upload/p2p.js
│   ├── app/               # 前台 SSR
│   ├── install/           # 安装向导（config/lock.js 判断已安装）
│   ├── middleware/        # auth.js（cookie + token 两级认证）
│   └── model/             # note/cate/site/token/user.js（Model 基类，this.db 链式查询）
├── config/                # app.js(base_dir/static_dir)、db.js(sqlite)、routes.js、view.js、lock.js
├── data/                  # menote.db + p2p-key.bin（节点密钥）+ p2p-allow.json（白名单）
├── docker/                # Docker 构建文件（Dockerfile、Run.sh、.dockerignore）
├── fpk/                   # 飞牛 fnOS FPK 应用打包目录（详见下方"飞牛 FPK 打包"章节）
├── public/static/admin/   # admin SPA：admin.js + admin.css（含移动端媒体查询）
├── public/static/common/  # vue/element-plus/vditor/sortablejs 等本地 vendor
└── public/upload/         # 用户上传的附件
```

## 关键约定

### 1. 改完代码不直接提交 git
改完停在未提交状态，汇报改动等待用户审查。用户明确说"提交"才提交。

### 2. admin SPA 模板变量必须 `setup()` return
本项目模板是**运行时编译**（非 SFC），`setup()` 未 return 的变量在模板里是 `undefined`，读属性直接抛 `TypeError` 使整个子树渲染中断。

**案例**：2026-09-07 适配手机端时 `NoteEditor` 引用 `store.isMobile` 忘 return `store`，导致编辑器全白，控制台报 `Cannot read properties of undefined (reading 'isMobile')`。

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

## admin SPA 改动模式

### 组件结构
`public/static/admin/admin.js` 单文件——顶部 `const {createApp, ref, ...} = Vue` 解构、统一 `request()` 封装、全局 `store` reactive、各页面组件对象（template 字符串 + setup()）。

### 加新页面五步流程
1. 写组件对象
2. `routes` 数组加 `{path: '/admin/xxx', component: Xxx}`
3. 侧栏 `tree-footer-actions` 加入口按钮
4. CSS 加进 `admin.css` 桌面区 + 移动端媒体查询块
5. bump `index_index.htm` 的 `?v=`（admin.js 和 admin.css 都有）

### 移动端架构（≤768px 单栏视图栈）
- `store.isMobile` / `mobileView('list'|'editor')` / `mobileSidebarOpen`
- 编辑器与列表互斥全屏，顶栏返回键由 `mobileView` 驱动
- 操作按钮触屏常显，Vditor 工具栏横滚
- 弹窗 `92vw`，设置/Token 页有返回键

改布局前先读 `admin.css` 末尾的移动端媒体查询块。

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

### 测试隔离（必须遵守）
**测 P2P 一律用 `P2P.init(app, {dataDir: 临时目录})`**（v1.8 后支持）——之前测试脚本直接跑、清理代码误删了真实 `data/p2p-key.bin`/`p2p-allow.json`，导致用户已配对数据丢失。教训：涉及真实数据文件的测试，永远先设隔离目录再跑。

`shutdown()` 现在会自动 `saveAllow()` 落盘（内存态同步到文件）。

**改生产路径必须与测试隔离参数分开写**：v1.8 测试隔离改版时把生产 `KEY_FILE`/`ALLOW_FILE` 也拼到了 `BASE_DIR` 根（丢掉 `data/` 子目录）——服务重启后密钥写到了项目根 `p2p-key.bin`，已在 init 里加杂散文件自动迁移回 `data/`（两边都有时 `data/` 优先）。

**节点 ID ≠ 私钥**：调试时算「当前进程的节点 ID」要用 `SecretKey.fromBytes(keyBytes).public().toString()`（公钥 hex）→ `toBase32Id`，直接拿 32 字节密钥文件内容转 base32 是错的（`fromString` 会报 "not a valid public key"，这是正确报错不是 bug）。

**密钥文件丢失/更换后手机必连不上且服务端无任何反应**（旧 ID 在 P2P 网络找不到节点，连接到不了服务端，连"未配对拒绝"都不会发生）——排查「连不上且无授权弹窗」先核对服务端控制台打印的 ID 与手机输入的 ID 是否同一个。

## 开发注意事项

### 服务器重启
3107 端口服务由用户经宝塔启动（`D:\BtSoft\nodejs\nodejs\node.exe .\server.js`），非 agent 启动。改了后端代码需请用户重启或确认；静态文件（`public/`）改盘即生效，无需重启。改前端 JS 后记得 bump `index_index.htm` 里 admin.js 的 `?v=` 版本参数防手机端缓存。

### Android 构建
```powershell
$env:JAVA_HOME = "D:\Program Files\Java\jdk-20"
cd D:\wwwroot\zzz\menote\android
.\gradlew.bat assembleRelease --no-daemon    # ~90s；只验编译用 compileDebugKotlin
```

输出 `app\build\outputs\apk\release\app-release.apk` → **一键脚本：`android\build-apk.bat`**（设 JDK20 → assembleRelease → 自动读 versionName 复制为 `MeNote-vX.Y-arm64.apk` 到 android 目录根）。

发版改 `app/build.gradle.kts` 的 `versionCode`/`versionName` 同步升。

签名自动读 android 目录下 `keystore.properties`（指向 `menote-p2p.jks`，已 gitignore），无需手动参数。

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
- `data/` 和 `public/upload/` 必须在 `.dockerignore` 排除

## 常见陷阱

1. **admin 模板变量忘 return** → 整个子树渲染中断，控制台报 `Cannot read properties of undefined`
2. **测 API 没带 AJAX 头** → 拿到 HTML 而不是 JSON（误以为是路由故障）
3. **测试脚本没放项目根** → config/app/model 全部加载不到，404
4. **P2P 测试没设隔离目录** → 误删真实密钥/白名单，已配对数据丢失
5. **改 `update_time` 逻辑时没区分编辑 vs 元数据操作** → 别处编辑产生虚假冲突
6. **删笔记时没同步清理附件** → `attach` 表孤儿数据 + 磁盘文件泄漏
7. **Android 端 `buildRequest` 透传 Content-Length** → 双 CL 头，POST 全挂
8. **节点 ID 编码混用** → 白名单 key 与查询 key 不一致，已授权节点 403

## 许可证

MIT License — 详见 [LICENSE](LICENSE)

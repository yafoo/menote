# MeNote PC 端（Go）

通过 iroh P2P 隧道在电脑上访问家里 NAS / 另一台电脑上的 MeNote，无需公网 IP、端口映射。

**无界面，纯命令行**——配对、启动、状态全部走命令，适合常驻后台或塞进开机自启。

思路与 [安卓端](../android/README.md) 完全一致，只是把 App 换成了 CLI：

```
浏览器 ──► 本机 127.0.0.1:3107 ──► iroh QUIC 双向流（ALPN menote-p2p/1）
        ──► 远端 MeNote 的 lib/p2p.js ──► jj.js 应用栈 ──► 笔记服务
```

MeNote 的 Vue SPA **零改动**，浏览器里用到的就是完整的后台 + 前台。

## 与安卓端的对应关系

| 安卓端 | PC 端 | 说明 |
|---|---|---|
| `IrohProxy.kt` 的 iroh Endpoint | `internal/tunnel` | 连接复用、无限自动重连、指数退避 |
| 本地 `ServerSocket` + 手写 HTTP/1.1 编解码 | `internal/proxy` + 标准库 `net/http` | 语义相同，实现更省 |
| 节点密钥存 `filesDir` | 节点密钥存配置目录 | 节点 ID 固定，授权一次长期有效 |
| `MainActivity` 配置页 / `ScanActivity` 扫码 | `menote-pc pair` / `id` | 命令行配对 |
| `WebActivity` 加载本地代理 | 系统默认浏览器 | `menote-pc run` 自动打开 |

## 为什么是纯 Go

底层用 [`github.com/tmc/go-iroh`](https://github.com/tmc/go-iroh)（iroh 协议的**纯 Go** 洁净室实现，线协议与上游 Rust iroh 兼容，且有对真实 Rust 二进制的互通测试）。

因为不涉及 cgo，所以：

- 交叉编译**不需要任何额外工具链**，`CGO_ENABLED=0` 一把梭
- Windows / Linux / macOS 全平台，amd64 / arm64 全覆盖
- 产出单个静态可执行文件，扔到 NAS 上直接跑

> 另一条路线是用 cgo 包 `iroh-ffi`（与安卓端同一套 Rust 库），协议兼容性最稳妥，但依赖各平台预编译静态库、需要 gcc，且目前**没有 macOS 库**。这里选了纯 Go。

## 环境要求

- **Go 1.26 或更新**（`go.mod` 声明 `go 1.26.0`；本机 Go 只要 ≥ 1.21，设 `GOTOOLCHAIN=auto` 就会自动拉取对应工具链）
- 国内网络建议设镜像：`go env -w GOPROXY=https://goproxy.cn,direct`

> `go.mod` 里额外写了 `toolchain go1.26.7`，是刻意的：只写 `go 1.26.0` 时 Go 会去拉**恰好 1.26.0**，
> 而 toolchain 包偶尔下不全（模块缓存里留个 96MB 的半成品，正常约 234MB），
> 结果是 `go build` 卡在 `go: downloading go1.26.0` 好几分钟不返回。钉一个具体版本即可绕开。

工具链下到一半被中断会留下麻烦：缓存里既有 `...partial` 也有个残缺的
`toolchain@v0.0.1-goX.Y.Z.<os>-<arch>` 目录，之后任何要拉这个版本的命令都会报
`remove ...partial: Access is denied` 而失败。**判断缓存是否完整就看目录大小**
（正常约 234MB，残缺的只有 200MB 出头）：

```sh
du -sh "$(go env GOMODCACHE)/golang.org/toolchain@v0.0.1-go1.26.7.windows-amd64"
```

遇上残缺的就删掉那个目录和同名 `.partial`（模块缓存里的文件是只读的，Windows 上先
`attrib -R /S` 或 `chmod -R +w`），或者干脆把 `toolchain` 钉到另一个已完整的版本。


## 构建

```sh
# 当前平台 → dist/menote-<os>-<arch>（Windows 为 .exe）
./build.sh              # Linux / macOS
build.bat               # Windows

# 全平台交叉编译（六平台一起进 dist/）
./build.sh all
build.bat all

# 只构建某一个系统的 amd64 + arm64
./build.sh linux        # 或 windows / darwin
```

产物**统一放在 `pc/dist/`，文件名统一是 `menote-<os>-<arch>`**（Windows 加 `.exe`）——
当前平台构建和交叉编译只差一个参数，规则完全一致，发布页上挑一个文件下载就能跑：

```
pc/dist/
├── menote-windows-amd64.exe
├── menote-windows-arm64.exe
├── menote-linux-amd64
├── menote-linux-arm64
├── menote-darwin-amd64
└── menote-darwin-arm64
```

也可以直接 `go build -o menote .`（那样产物名由你自己定）。

## 配对流程

1. **服务端**启动 MeNote（`npm run dev` 或 `npm start`），记下控制台打印的
   `[p2p] 本节点 ID: xxxxxxxx…`（也可以在后台「P2P 管理」页看到，带二维码）
2. **PC 端**执行配对，把服务端节点 ID 粘贴进去：

   ```sh
   menote-pc pair
   ```

   它会把 ID 存进配置，并立刻试连一次。首次连接必然失败，并打印：

   ```
   ✗ 服务端拒绝了本机连接：本节点尚未授权。

   请到服务端 MeNote 后台 →「P2P 管理」，把下面这串加入白名单：
       4477hbkpk4a33fshvzvyeqxjg5oneklo2hai34pxyn4kujwkf5aa
   ```

3. 到服务端后台 **「P2P 管理」** 授权上面那串节点 ID（和授权手机端是同一个地方）
4. 复验：

   ```sh
   menote-pc pair --check-only
   # ✓ 配对成功，已连上服务端（直连 P2P）
   ```

5. 日常启动：

   ```sh
   menote-pc run
   ```

   浏览器会自动打开 `http://127.0.0.1:3107`（端口被占用时自动顺延，见下）。

> 服务端白名单是**实时校验**的：后台点完授权，下一次重连自动通过，
> **不需要重启 PC 端程序**。

## 命令

| 命令 | 说明 |
|---|---|
| `run` | 启动隧道 + 本地代理，前台运行，`Ctrl+C` 退出 |
| `pair [节点ID]` | 保存服务端节点 ID 并验证连通性；不带参数则交互式输入 |
| `pair --check-only` | 只验证当前配置的连通性，不改配置 |
| `id` | 显示本机节点 ID（后台授权时填这个） |
| `status` | 显示配置、本机身份、代理与**隧道**状态（代理在跑时只读本机回环，不联网） |
| `open` | 用默认浏览器打开本地代理（自动识别实际端口），顺带报一下当前连接方式 |
| `version` / `help` | — |

`status` 在代理运行时会长这样——**连接方式**就是你要找的那个"直连还是中继"：

```
本地代理       正在运行 → http://127.0.0.1:3108
隧道状态       已连接
连接方式       直连 10.46.0.2:55793
已连接时长     3分12秒
```

隧道没通时会变成 `隧道状态 重连中` + `最近一次错误 …`，`连接方式` 那一行不显示
（还没探到路径，显示「路径探测中」只是噪音）。

`run` 的常用参数：

```sh
menote-pc run --server <节点ID>   # 临时指定服务端，不改配置
menote-pc run --port 8080         # 改本地端口
menote-pc run --no-browser        # 不自动开浏览器（适合做服务）
menote-pc run --quiet             # 不打印每条请求日志
```

## 端口处理

默认监听 `127.0.0.1:3107`，**启动前会先探测端口是否已被占用**，占用则顺延
`3108`、`3109`…（最多试 11 个），与安卓端逻辑一致。

探测这一步不能省。Windows 允许 `127.0.0.1:3107` 和 `0.0.0.0:3107` **同时 bind**
（不像 Linux 直接报 `EADDRINUSE`），所以如果本机自己也跑着 MeNote，只靠 bind
失败是发现不了的——代理会悄悄把回环流量抢过来，用户打开的是**本机的** MeNote
而不是远端那台。显式探一次端口就能避开。

`menote-pc open` 和 `status` 通过响应头 `X-Menote-Pc-Proxy` 在候选端口区间里
认出真正的代理端口，不会把本机 MeNote 误认成代理。

## 代理自带的两个端点

代理在 `/__menote_pc__/` 下留了两个**就地应答、不进隧道**的路径。它们不会和
MeNote 的任何路由冲突，也只在 `127.0.0.1` 上可达：

| 路径 | 用途 |
|---|---|
| `/__menote_pc__/ping` | 探测「这个端口上是不是我们的代理」，返回 `menote-pc` |
| `/__menote_pc__/status` | 代理与隧道的运行时状态（JSON），给 `status` / `open` 用 |

**为什么探测不打 `/`**：隧道没就绪时普通请求会被挡住最多 10 秒才吐出 502 提示页，
而探测超时只有 800ms，于是超时 → 误判「代理未运行」。上面这两个端点毫秒级返回。

**为什么状态要走 HTTP**：`run` 是一个进程、`status` 是另一个进程，后者读不到前者
内存里的隧道状态。走回环 HTTP 是最省的跨进程通道——不用再引入 pid 文件、
Unix socket 或命名管道那一套平台差异。

```sh
curl --noproxy '*' http://127.0.0.1:3108/__menote_pc__/status
```

```json
{
  "version": "1.0.0",
  "port": 3108,
  "url": "http://127.0.0.1:3108",
  "tunnel": {
    "state": "ready",
    "state_text": "已连接",
    "path": "direct",
    "path_text": "直连 10.46.0.2:55793",
    "remote_addr": "10.46.0.2:55793",
    "local_id": "…52 位 base32…",
    "peer_id": "…52 位 base32…",
    "connected_at": "2026-09-28T16:21:19+08:00",
    "uptime_seconds": 192,
    "attempts": 0
  }
}
```

`path` 是 `direct`（打洞成功的直连）或 `relay`（中继兜底）；`attempts` 是连续失败次数，
成功一次就归零。想脚本化监控（比如打洞失败告警）直接解析这个 JSON 就行。

## 文件位置

配置目录按各平台惯例（`os.UserConfigDir()`）：

| 平台 | 路径 |
|---|---|
| Windows | `%AppData%\menote-pc\` |
| Linux | `~/.config/menote-pc/`（或 `$XDG_CONFIG_HOME`） |
| macOS | `~/Library/Application Support/menote-pc/` |

里面有：

- `config.json` —— 服务端节点 ID、监听地址、端口
- `node-key.bin` —— 节点身份密钥（32 字节），**删掉它节点 ID 就会变，需要重新授权**

可用 `--config-dir <dir>` 或环境变量 `MENOTE_CONFIG_DIR` 指定别处（便于多实例并存）：

```sh
menote-pc --config-dir /tmp/menote-a run --port 3107
menote-pc --config-dir /tmp/menote-b run --port 3207
```

环境变量覆盖：`MENOTE_SERVER` / `MENOTE_LISTEN` / `MENOTE_PORT` / `MENOTE_OPEN_BROWSER`。

## 与安卓端的实现差异

| 点 | 安卓端 | PC 端 |
|---|---|---|
| HTTP 编解码 | 手写 `HttpCodec`，自己找 `\r\n\r\n`、拆头、拼 body | `http.Request.Write` + `http.ReadResponse` |
| 响应体 | `readToEnd` 一次性缓冲（上限 64MB/请求） | 流式转发，大附件不再吃内存 |
| 传输层 | 本地 TCP socket ↔ QUIC 双向流 | `http.RoundTripper` ↔ QUIC 双向流 |
| 请求头 | 跳过 `Connection`/`Content-Length`/`Transfer-Encoding` 自行生成 | 同上（`Close=true` 让标准库写 `Connection: close`） |

相同点：**每请求一条 QUIC 双向流、连接级复用**，服务端侧语义完全一致。

## 排查

| 现象 | 处理 |
|---|---|
| 浏览器 502，页面写着「本节点未获授权」 | 去服务端后台「P2P 管理」授权页面里那串节点 ID |
| 浏览器 502，「等待隧道超时」 | 服务端没在跑，或网络不通；`menote-pc pair --check-only` 看具体原因 |
| 提示端口全被占用 | `--port` 换个区间，或 `menote-pc status` 看有没有旧实例在跑 |
| 想换一个身份重新配对 | 删掉配置目录里的 `node-key.bin`，再 `menote-pc pair` |
| 连上了但很慢 | 看 `run` 日志里是「直连」还是「中继」。中继是打洞失败时的兜底，稍慢属正常；网络环境变化后会自动切回直连 |

## 代码结构

```
pc/
├── main.go                      # CLI：命令分发、日志、浏览器
├── build.sh / build.bat         # 构建脚本
└── internal/
    ├── config/                  # 配置 + 节点密钥的读写（跨平台路径）
    ├── nodeid/                  # 节点 ID 编解码（base32，与 lib/p2p.js 一致）
    ├── tunnel/                  # iroh endpoint、连接复用、自动重连、路径探测
    └── proxy/                   # 本地 HTTP 代理 → QUIC 双向流
```

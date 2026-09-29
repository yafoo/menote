// menote-pc —— MeNote 的 PC 端 P2P 隧道客户端（无界面，纯命令行）。
//
// 思路与安卓端 App 完全一致，只是把界面换成了命令行：
//
//	浏览器 → 本机 127.0.0.1:3107 → iroh QUIC（ALPN menote-p2p/1）
//	  → 远端 MeNote 的 lib/p2p.js → jj.js 应用栈 → 笔记服务
//
// MeNote 的 Vue SPA 零改动，浏览器里用到的就是完整的后台/前台。
package main

import (
	"bufio"
	"context"
	"errors"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/tmc/go-iroh/key"

	"menote-pc/internal/config"
	"menote-pc/internal/nodeid"
	"menote-pc/internal/proxy"
	"menote-pc/internal/tunnel"
)

const version = "1.0.0"

// 打开浏览器前等待隧道就绪的上限（等不到也照样打开，页面上有指引）。
const browserWait = 20 * time.Second

func main() {
	args := os.Args[1:]

	// 先摘出 --config-dir（可出现在任意位置），再解析子命令
	args, err := extractConfigDir(args)
	if err != nil {
		fatal("%v", err)
	}

	// argv[0] 就是程序文件名（决定了用户实际敲的名字），横幅/错误里都用它，
	// 不再硬编码 menote-pc——否则双击 menote-windows-amd64.exe 时文案会对不上。
	prog = filepath.Base(os.Args[0])

	// 无参数、或首个参数就是选项（--port 8080 / --quiet）→ 当作 run。
	// 后者是「不带命令也能用」的必然要求：既然 run 可以省略，那 `prog --port 8080`
	// 就应该等价于 `prog run --port 8080`，不能把 --port 当成命令名。
	// -h/--help/-v/--version 除外，它们要落到下面的 switch 里。
	//
	// 主路径是 `run`（进程生命周期与命令名一致），如果后面加 stop/restart
	// 这类管理命令，要重新想过——到时候省略命令名会比现在危险。
	if cmd := firstNonOption(args); cmd == "" {
		if len(args) == 0 && !isInteractive() {
			// 双击 / 被托管拉起：stdin 不是终端，没人看这个窗口。
			// 静音、也别自动弹浏览器。
			cmdRun([]string{"--quiet", "--no-browser"})
			return
		}
		cmdRun(args)
		return
	}

	cmd, rest := args[0], args[1:]
	switch cmd {
	case "run":
		cmdRun(rest)
	case "pair":
		cmdPair(rest)
	case "id":
		cmdID()
	case "status":
		cmdStatus()
	case "open":
		cmdOpen()
	case "version", "-v", "--version":
		fmt.Printf("%s %s (%s/%s)\n", prog, version, runtime.GOOS, runtime.GOARCH)
	case "help", "-h", "--help":
		usage()
	default:
		fmt.Fprintf(os.Stderr, "未知命令：%s\n\n", cmd)
		usage()
		os.Exit(2)
	}
}

// firstNonOption 返回第一个「看起来像命令名」的参数；没有就返回 ""。
//
// 关键是要知道哪些选项**带值**（--port 8080 / --server <id> / --listen <addr>），
// 否则 8080 会被误当成命令名——我第一版就栽在这儿，`prog --port 8099` 报
// 「未知命令：--port」然后是「未知命令：8099」。
//
// 另外要理解 Go flag 的解析约定：`-` 和 `--` 前缀等价，且布尔选项可以写成
// `--quiet=false`。这里只需要判断「有没有命令名」，不必完全复刻 flag 的规则。
func firstNonOption(args []string) string {
	for i := 0; i < len(args); i++ {
		a := args[i]
		if a == "" {
			continue
		}
		if !strings.HasPrefix(a, "-") {
			return a // 找到命令名
		}
		if isGlobalOption(a) {
			return a
		}
		// --flag=value 自带值，不占下一个位置
		if strings.Contains(a, "=") {
			continue
		}
		// 带值的选项：跳过它的值，别把值当命令名
		if takesValue(a) {
			i++
		}
	}
	return ""
}

// takesValue 报告该选项后是否紧跟一个独立的值参数（`--port 8080` 形式）。
func takesValue(a string) bool {
	switch strings.TrimLeft(a, "-") {
	case "server", "port", "listen", "config-dir":
		return true
	}
	return false // --quiet / --no-browser / --check-only 是布尔量
}

// isGlobalOption 报告该参数是否是「与子命令无关」的通用选项。
func isGlobalOption(a string) bool {
	switch a {
	case "-h", "--help", "-v", "--version":
		return true
	}
	return false
}

// prog 是当前进程对外显示的名字，取自 os.Args[0] 的文件名部分。
//
// 用户把产物重命名成什么，提示文案就跟着叫什么——发布产物的名字里带
// 系统/架构（menote-windows-amd64.exe），硬编码 "menote-pc" 会让
// 「接下来执行 menote-pc run」这类提示和磁盘上的文件对不上。
var prog = "menote-pc"

// isInteractive 判断 stdin 是不是连着终端，实现见 term_<os>.go。
//
// ⚠ 这件事比看上去麻烦，两个坑都踩过：
//   - `ModeCharDevice` 不够：**/dev/null 也是字符设备**，`< /dev/null`
//     会被判成「坐在终端前」
//   - Windows 上 Go 的 `FileInfo.Name()` 恒为 `"stdin"`，拿不到设备名，
//     所以按名字区分设备的那套在 Windows 上直接失效
//
// 结论：Windows 走 `GetConsoleMode`（NUL/管道/文件一律失败，只有真控制台成功），
// 其余平台看字符设备名（tty/pts/ttys）。

func usage() {
	fmt.Printf(`%s —— MeNote PC 端 P2P 隧道（命令行）

用法：
  %s [命令] [参数...]

  不带命令 = run（等同于双击启动；在终端里直接回车也会跑起来）。

命令：
  run       启动隧道 + 本地代理（前台运行，Ctrl+C 退出）【默认】
  pair      配对：保存服务端节点 ID，并立即验证是否已授权
  id        显示本机节点 ID（服务端后台授权时要填的就是它）
  status    显示配置与本机身份（离线，不联网）
  open      用默认浏览器打开本地代理地址（自动识别实际端口）
  version   显示版本

run 参数：
  --server <id>    服务端节点 ID（覆盖配置文件）
  --port <n>       本地代理端口（默认 3107，被占用自动 +1）
  --listen <addr>  本地代理监听地址（默认 127.0.0.1）
  --no-browser     启动后不自动打开浏览器
  --quiet          不打印每条请求的日志

pair 参数：
  --check-only     只验证当前配置的连通性，不改配置

通用：
  --config-dir <dir>   指定配置目录（等价于环境变量 MENOTE_CONFIG_DIR）

环境变量：
  MENOTE_SERVER        服务端节点 ID
  MENOTE_LISTEN        本地监听地址
  MENOTE_PORT          本地端口
  MENOTE_OPEN_BROWSER  0/1，是否自动开浏览器
  MENOTE_CONFIG_DIR    配置目录

典型流程：
  1. 服务端启动 MeNote，记下控制台打印的「本节点 ID」
  2. %s pair                # 粘贴服务端节点 ID（这一步不能省，双击也替代不了）
  3. 若提示未授权，按提示到服务端后台「P2P 管理」授权本机节点
  4. 双击本程序                # 或 %s run / 直接回车
     浏览器会自动打开 http://127.0.0.1:3107
`, prog, prog, prog, prog)
}

// ---------- run ----------

func cmdRun(args []string) {
	fs := newFlagSet("run")
	serverFlag := fs.String("server", "", "服务端节点 ID（覆盖配置）")
	portFlag := fs.Int("port", 0, "本地代理端口")
	listenFlag := fs.String("listen", "", "本地代理监听地址")
	noBrowser := fs.Bool("no-browser", false, "启动后不自动打开浏览器")
	quiet := fs.Bool("quiet", false, "不打印每条请求的日志")
	mustParse(fs, args)

	cfg, err := config.Load()
	if err != nil {
		fatal("%v", err)
	}
	if *serverFlag != "" {
		cfg.ServerNodeID = strings.TrimSpace(*serverFlag)
	}
	if *portFlag > 0 {
		cfg.Port = *portFlag
	}
	if *listenFlag != "" {
		cfg.Listen = *listenFlag
	}
	if *noBrowser {
		cfg.AutoOpenBrowser = false
	}

	lg := newLogger(*quiet)

	// 先校验服务端节点 ID：缺了/写错了就在这里停下，别带着零值去空转重连
	serverID, err := resolveServer(cfg)
	if err != nil {
		fatal("%v", err)
	}

	sk, created, err := config.LoadOrCreateSecretKey()
	if err != nil {
		fatal("%v", err)
	}
	tun, err := newTunnel(context.Background(), sk, serverID, lg.log)
	if err != nil {
		fatal("%v", err)
	}
	defer tun.Close()
	// 失败路径不能被 --quiet 压掉（双击启动就靠这一路才知道出了什么事）
	tun.SetImportantLogf(lg.logImportant)

	if !*quiet {
		printBanner(tun, created)
	} else {
		// 双击/托管场景：窗口里没人看，但首次使用必须知道要去后台授权
		printQuietFirstRunHint(tun.LocalID(), created)
	}

	// 代理先起来：这样即使隧道还没通，浏览器也能看到带指引的提示页
	px := proxy.New(tun, lg.log)
	px.Verbose = !*quiet
	px.Version = version
	// 端口顺延、请求失败这类信息即使 --quiet 也要留声
	px.SetImportantLogf(lg.logImportant)
	go func() {
		if err := px.ListenAndServe(cfg.Listen, cfg.Port); err != nil {
			fatal("本地代理启动失败：%v", err)
		}
	}()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	tun.Start(ctx)

	if cfg.AutoOpenBrowser {
		go func() {
			// 先等代理真正监听（拿到实际端口），再等隧道就绪
			select {
			case <-px.Ready():
			case <-time.After(5 * time.Second):
			}
			waitReady(ctx, tun, browserWait)
			url := px.Addr()
			if url == "" {
				url = fmt.Sprintf("http://%s:%d", cfg.Listen, cfg.Port)
			}
			if err := openBrowser(url); err != nil {
				lg.log("自动打开浏览器失败（%v），请手动访问 %s", err, url)
			}
		}()
	}

	<-ctx.Done()
	fmt.Println()
	lg.log("收到退出信号，正在关闭…")
	px.Stop()
	// tun.Close 由 defer 执行
}

// ---------- pair ----------

func cmdPair(args []string) {
	fs := newFlagSet("pair")
	checkOnly := fs.Bool("check-only", false, "只验证当前配置的连通性")
	mustParse(fs, args)

	cfg, err := config.Load()
	if err != nil {
		fatal("%v", err)
	}

	if !*checkOnly {
		input := strings.TrimSpace(strings.Join(fs.Args(), " "))
		if input == "" {
			input, err = promptLine("请粘贴服务端节点 ID（MeNote 启动日志或后台「P2P 管理」里显示的那串）：\n> ")
			if err != nil {
				fatal("读取输入失败：%v", err)
			}
		}
		if input == "" {
			fatal("没有输入节点 ID")
		}
		normalized, err := nodeid.Normalize(input)
		if err != nil {
			fatal("%v", err)
		}
		cfg.ServerNodeID = normalized
		if err := cfg.Save(); err != nil {
			fatal("%v", err)
		}
		fmt.Printf("✓ 已保存服务端节点 ID：%s\n", normalized)
		fmt.Printf("  配置文件：%s\n\n", cfg.DirPath())
	}

	serverID, err := resolveServer(cfg)
	if err != nil {
		fatal("%v", err)
	}

	lg := newLogger(false)
	sk, created, err := config.LoadOrCreateSecretKey()
	if err != nil {
		fatal("%v", err)
	}
	tun, err := newTunnel(context.Background(), sk, serverID, lg.log)
	if err != nil {
		fatal("%v", err)
	}
	defer tun.Close()

	st := tun.Status()
	fmt.Println("正在连接服务端…")
	fmt.Printf("  服务端节点 ID  %s\n", st.PeerID)
	fmt.Printf("  本机节点 ID    %s\n", st.LocalID)
	if created {
		fmt.Println("  （本次新生成了身份密钥，节点 ID 固定后长期有效）")
	}
	fmt.Println()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	tun.Start(ctx)

	if ok := waitReady(ctx, tun, 25*time.Second); ok {
		s := tun.Status()
		fmt.Printf("✓ 配对成功，已连上服务端（%s）\n", pathDesc(s.Path))
		fmt.Println("  接下来直接运行本程序（双击，或不带命令执行）即可启动本地代理")
		return
	}

	s := tun.Status()
	if s.State == tunnel.StateRejected {
		fmt.Println("✗ 服务端拒绝了本机连接：本节点尚未授权。")
		fmt.Println()
		fmt.Println("请到服务端 MeNote 后台 →「P2P 管理」，把下面这串加入白名单：")
		fmt.Printf("    %s\n", s.LocalID)
		fmt.Println()
		fmt.Printf("授权后本程序会自动连上，无需重启。再跑一次 %s pair --check-only 可复验。\n", prog)
		os.Exit(1)
	}
	fmt.Printf("✗ 连接未成功（当前状态：%s）\n", s.State)
	if s.LastError != "" {
		fmt.Printf("  最近错误：%s\n", s.LastError)
	}
	fmt.Println("  请确认服务端 MeNote 正在运行、网络可达，然后重试。")
	os.Exit(1)
}

// ---------- id / status / open ----------

func cmdID() {
	sk, created, err := config.LoadOrCreateSecretKey()
	if err != nil {
		fatal("%v", err)
	}
	// 用临时 endpoint 拿到公钥对应的节点 ID（不联网，也不需要服务端 ID）
	tun, err := newTunnel(context.Background(), sk, key.EndpointID{}, func(string, ...any) {})
	if err != nil {
		fatal("%v", err)
	}
	defer tun.Close()

	id := tun.LocalID()
	dir, _ := config.Dir()
	fmt.Printf("本机节点 ID（base32）  %s\n", nodeid.Encode(id))
	fmt.Printf("本机节点 ID（hex）     %s\n", id.String())
	fmt.Printf("配置目录               %s\n", dir)
	if created {
		fmt.Println("（本次新生成了身份密钥）")
	}
	fmt.Println()
	fmt.Println("服务端后台「P2P 管理」里填 base32 那串即可。")
}

func cmdStatus() {
	cfg, err := config.Load()
	if err != nil {
		fatal("%v", err)
	}
	dir, _ := config.Dir()

	fmt.Printf("%s %s (%s/%s)\n\n", prog, version, runtime.GOOS, runtime.GOARCH)
	fmt.Printf("配置目录       %s\n", dir)
	fmt.Printf("服务端节点 ID  %s\n", orDash(cfg.ServerNodeID))
	fmt.Printf("本地监听       %s:%d\n", cfg.Listen, cfg.Port)
	fmt.Printf("自动开浏览器   %v\n", cfg.AutoOpenBrowser)

	// 先问运行中的代理。它在跑的话，本机节点 ID 和隧道状态都能直接读回来，
	// 就不必再绑一个 iroh endpoint —— 省掉一次网络绑定，也避免同一身份双绑。
	st, port, proxyErr := proxy.FetchStatus(cfg.Listen, cfg.Port)

	if proxyErr == nil && st.Tunnel.LocalID != "" {
		fmt.Printf("本机节点 ID    %s\n", st.Tunnel.LocalID)
	} else {
		sk, created, err := config.LoadOrCreateSecretKey()
		if err != nil {
			fatal("%v", err)
		}
		tun, err := newTunnel(context.Background(), sk, key.EndpointID{}, func(string, ...any) {})
		if err != nil {
			fatal("%v", err)
		}
		defer tun.Close()
		fmt.Printf("本机节点 ID    %s\n", nodeid.Encode(tun.LocalID()))
		if created {
			fmt.Println("（本次新生成了身份密钥）")
		}
	}

	if proxyErr != nil {
		fmt.Println("本地代理       未运行")
	} else {
		fmt.Printf("本地代理       正在运行 → http://%s:%d\n", cfg.Listen, port)
		if st.Version != "" && st.Version != version {
			fmt.Printf("              （运行中的是 v%s，与本机 v%s 不同）\n", st.Version, version)
		}
		fmt.Printf("隧道状态       %s\n", orDash(st.Tunnel.StateText))
		// 只有真的探到路径才显示，否则「路径探测中」是噪音
		if st.Tunnel.Path != "" {
			fmt.Printf("连接方式       %s\n", st.Tunnel.PathText)
		}
		if st.Tunnel.UptimeSeconds > 0 {
			fmt.Printf("已连接时长     %s\n", humanDuration(time.Duration(st.Tunnel.UptimeSeconds)*time.Second))
		}
		if st.Tunnel.LastError != "" {
			fmt.Printf("最近一次错误   %s\n", st.Tunnel.LastError)
		}
	}

	switch {
	case strings.TrimSpace(cfg.ServerNodeID) == "":
		fmt.Printf("\n提示：还没配置服务端节点 ID，执行 %s pair\n", prog)
	default:
		if _, err := nodeid.Parse(cfg.ServerNodeID); err != nil {
			fmt.Printf("\n⚠ %v\n", err)
			fmt.Printf("  重新配置：%s pair\n", prog)
		} else if proxyErr == nil && st.Tunnel.State == "ready" {
			fmt.Println("\n提示：隧道已就绪，直接访问上面的地址即可")
		} else {
			fmt.Printf("\n提示：连通性验证请执行 %s pair --check-only\n", prog)
		}
	}
}

func cmdOpen() {
	cfg, err := config.Load()
	if err != nil {
		fatal("%v", err)
	}
	// 端口可能因占用自动 +1，先问运行中的代理它到底在哪个端口
	st, port, err := proxy.FetchStatus(cfg.Listen, cfg.Port)
	if err != nil {
		if errors.Is(err, proxy.ErrNoProxy) {
			fatal("没有检测到正在运行的本地代理（已在 %s:%d 起的 %d 个端口里找过）。请先运行 %s",
				cfg.Listen, cfg.Port, proxy.PortTries, prog)
		}
		fatal("读取本地代理状态失败：%v", err)
	}
	url := fmt.Sprintf("http://%s:%d", cfg.Listen, port)
	if err := openBrowser(url); err != nil {
		fatal("打开浏览器失败：%v（请手动访问 %s）", err, url)
	}
	// 顺带报一下隧道状态：页面打得开但很慢时，一眼能看出是不是在走中继
	fmt.Printf("已请求打开 %s（%s，%s）\n", url, st.Tunnel.StateText, st.Tunnel.PathText)
}

// ---------- 公共部件 ----------

func newTunnel(ctx context.Context, sk key.SecretKey, serverID key.EndpointID, logf tunnel.Logf) (*tunnel.Tunnel, error) {
	return tunnel.New(ctx, sk, serverID, logf)
}

// resolveServer 解析配置里的服务端节点 ID。
//
// run / pair 必须先过这一关：缺配置时若放行，隧道会拿着零值节点 ID 一直
// 重连（报 "no reachable address"），界面还会把零值显示成 52 个 a，很难看出
// 真正原因是"没配对"。
func resolveServer(cfg *config.Config) (key.EndpointID, error) {
	raw := strings.TrimSpace(cfg.ServerNodeID)
	if raw == "" {
		return key.EndpointID{}, fmt.Errorf("还没配置服务端节点 ID，先执行：%s pair", prog)
	}
	id, err := nodeid.Parse(raw)
	if err != nil {
		return key.EndpointID{}, fmt.Errorf("%v（当前配置：%s）", err, raw)
	}
	return id, nil
}

// printQuietFirstRunHint 在静音模式下、且本次刚生成身份密钥时，把「要去后台
// 授权」这件事说出来。
//
// 为什么只在这一种情况下说话：双击启动时窗口里没人看，平时一个字都不该刷；
// 但首次使用如果不授权，程序会一直重连、用户完全不知道为什么——这是唯一
// 必须打断的情形。localID 直接取自 run 已绑好的 endpoint（节点 ID 就是密钥
// 公钥，与联网无关），不必再建一个临时 endpoint。
func printQuietFirstRunHint(localID key.EndpointID, created bool) {
	if !created {
		return
	}
	fmt.Println()
	fmt.Println("⚠ 首次使用：本机节点尚未授权，隧道会一直连不上。")
	fmt.Println("  请到服务端 MeNote 后台 →「P2P 管理」，把下面这串加入白名单：")
	fmt.Println()
	fmt.Printf("    %s\n", nodeid.Encode(localID))
	fmt.Println()
	fmt.Println("  授权后本程序会自动连上，无需重启。")
}

func printBanner(tun *tunnel.Tunnel, created bool) {
	st := tun.Status()
	dir, _ := config.Dir()

	fmt.Printf("MeNote PC 隧道 v%s\n\n", version)
	fmt.Printf("  配置目录     %s\n", dir)
	fmt.Printf("  服务端节点   %s\n", st.PeerID)
	fmt.Printf("  本机节点     %s\n", st.LocalID)
	if created {
		fmt.Println("  （本次新生成了身份密钥，节点 ID 固定后长期有效）")
		fmt.Println()
		fmt.Println("  ⚠ 首次使用：请到服务端 MeNote 后台 →「P2P 管理」，把上面的本机节点 ID")
		fmt.Println("    加入白名单。授权后本程序会自动连上，无需重启。")
	}
	fmt.Println()
}

// waitReady 轮询等待隧道就绪，返回是否就绪。
func waitReady(ctx context.Context, tun *tunnel.Tunnel, max time.Duration) bool {
	deadline := time.Now().Add(max)
	for time.Now().Before(deadline) {
		if tun.Status().State == tunnel.StateReady {
			return true
		}
		select {
		case <-ctx.Done():
			return false
		case <-time.After(200 * time.Millisecond):
		}
	}
	return tun.Status().State == tunnel.StateReady
}

func pathDesc(p string) string {
	switch p {
	case "direct":
		return "直连 P2P"
	case "relay":
		return "中继"
	}
	return "路径探测中"
}

func openBrowser(url string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	case "darwin":
		cmd = exec.Command("open", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	return cmd.Start()
}

func promptLine(prompt string) (string, error) {
	fmt.Print(prompt)
	sc := bufio.NewScanner(os.Stdin)
	if !sc.Scan() {
		if err := sc.Err(); err != nil {
			return "", err
		}
		return "", nil
	}
	return strings.TrimSpace(sc.Text()), nil
}

func newFlagSet(name string) *flag.FlagSet {
	fs := flag.NewFlagSet(name, flag.ContinueOnError)
	fs.Usage = func() { usage() }
	return fs
}

func mustParse(fs *flag.FlagSet, args []string) {
	if err := fs.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			os.Exit(0)
		}
		os.Exit(2)
	}
}

func orDash(s string) string {
	if strings.TrimSpace(s) == "" {
		return "（未配置）"
	}
	return s
}

// humanDuration 把时长压成中文短文案（"3分12秒" / "1小时05分" / "2天3小时"）。
//
// 只给 status 看，粒度到秒即可，不做 i18n。
func humanDuration(d time.Duration) string {
	if d < 0 {
		d = 0
	}
	sec := int64(d.Seconds())
	switch {
	case sec < 60:
		return fmt.Sprintf("%d秒", sec)
	case sec < 3600:
		return fmt.Sprintf("%d分%02d秒", sec/60, sec%60)
	case sec < 86400:
		return fmt.Sprintf("%d小时%02d分", sec/3600, (sec%3600)/60)
	default:
		return fmt.Sprintf("%d天%d小时", sec/86400, (sec%86400)/3600)
	}
}

func fatal(format string, a ...any) {
	fmt.Fprintf(os.Stderr, "错误："+format+"\n", a...)
	os.Exit(1)
}

// extractConfigDir 摘出 --config-dir / -config-dir，设置成环境变量。
func extractConfigDir(args []string) ([]string, error) {
	out := make([]string, 0, len(args))
	for i := 0; i < len(args); i++ {
		a := args[i]
		switch {
		case a == "--config-dir" || a == "-config-dir":
			if i+1 >= len(args) {
				return nil, errors.New("--config-dir 缺少参数")
			}
			if err := os.Setenv("MENOTE_CONFIG_DIR", args[i+1]); err != nil {
				return nil, err
			}
			i++
		case strings.HasPrefix(a, "--config-dir="):
			if err := os.Setenv("MENOTE_CONFIG_DIR", strings.TrimPrefix(a, "--config-dir=")); err != nil {
				return nil, err
			}
		default:
			out = append(out, a)
		}
	}
	return out, nil
}

// ---------- 日志 ----------

type logger struct {
	mu    sync.Mutex
	quiet bool
}

// newLogger 造一个状态日志器。quiet 为真时只保留错误级输出——
// 双击启动走的正是这条路：那个黑窗口里没人看，就别往里刷字。
func newLogger(quiet bool) *logger { return &logger{quiet: quiet} }

// log 输出关键状态（要让人看见的进度/状态变化）。
func (l *logger) log(format string, a ...any) {
	if l.quiet {
		return
	}
	l.write("", format, a...)
}

// logImportant 输出用户必须知道的信息：启动初期、出错、重连。
//
// 判据是「多等一会儿会不会自己好」——会好的（正在连接、就绪）只走 log，
// 不会的（连不上、被拒、端口占用、掉线重连）即使 --quiet 也要说。
// 否则双击启动失败时，用户面对的是一个完全沉默的窗口。
func (l *logger) logImportant(format string, a ...any) {
	l.write("", format, a...)
}

func (l *logger) write(prefix, format string, a ...any) {
	l.mu.Lock()
	defer l.mu.Unlock()
	fmt.Fprintf(os.Stdout, "[%s] %s%s\n", time.Now().Format("15:04:05"), prefix, fmt.Sprintf(format, a...))
}

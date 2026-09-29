// Package tunnel 用 iroh QUIC 把本机接到远端 MeNote 服务端。
//
// 对应安卓端 IrohProxy 的连接部分，只是没有界面，状态走日志与命令行：
//
//	本机代理 → iroh QUIC 双向流（ALPN menote-p2p/1）
//	  → 服务端 lib/p2p.js → jj.js 应用栈 → MeNote
//
// 与安卓端一致的三条关键行为：
//  1. 节点密钥持久化 —— 节点 ID 固定，服务端后台授权一次长期有效
//  2. QUIC 连接级复用 —— 一个连接承载全部 HTTP 请求（每请求一条双向流）
//  3. 无限自动重连 —— 指数退避 5s→10s→20s→40s→60s 封顶；
//     服务端白名单是实时校验的，后台点完「授权」下一次重试就连上，无需重启
package tunnel

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/tmc/go-iroh/iroh"
	"github.com/tmc/go-iroh/key"
	"github.com/tmc/go-iroh/netaddr"
	"github.com/tmc/go-iroh/relay"

	"menote-pc/internal/nodeid"
)

// ALPN 必须与服务端 lib/p2p.js 的 P2P.ALPN 完全一致。
const ALPN = "menote-p2p/1"

// 重连退避参数（与安卓端对齐）。
const (
	retryBase   = 5 * time.Second
	retryMax    = 60 * time.Second
	dialTimeout = 30 * time.Second
	// livenessWait 是「连上后存活确认」窗口。服务端对未授权节点是
	// 握手成功 → 立刻 close(403)，毫秒级发生，所以连上后必须等一下再看。
	livenessWait = 2 * time.Second
	// pathPollInterval 轮询连接路径（直连/中继）的间隔。
	// 打洞成功 relay→直连 的切换在分钟级，3s 粒度足够。
	pathPollInterval = 3 * time.Second
)

// ErrNotReady 隧道尚未就绪（连接中 / 重连中）。
var ErrNotReady = errors.New("隧道未就绪")

// ErrRejected 服务端在握手后立即断开——通常表示本节点未授权。
var ErrRejected = errors.New("服务端拒绝连接")

// State 是隧道的连接状态。
type State int

const (
	StateIdle State = iota
	StateConnecting
	StateReady
	StateReconnecting
	StateRejected
	StateClosed
)

func (s State) String() string {
	switch s {
	case StateIdle:
		return "未启动"
	case StateConnecting:
		return "连接中"
	case StateReady:
		return "已连接"
	case StateReconnecting:
		return "重连中"
	case StateRejected:
		return "未授权"
	case StateClosed:
		return "已停止"
	}
	return "未知"
}

// Key 返回状态的机器可读标识（供 status 端点输出 JSON 用），与 String 的中文文案一一对应。
func (s State) Key() string {
	switch s {
	case StateIdle:
		return "idle"
	case StateConnecting:
		return "connecting"
	case StateReady:
		return "ready"
	case StateReconnecting:
		return "reconnecting"
	case StateRejected:
		return "rejected"
	case StateClosed:
		return "closed"
	}
	return "unknown"
}

// Status 是隧道状态快照，供命令行展示。
type Status struct {
	State       State
	LocalID     string // 本机节点 ID（base32）
	PeerID      string // 服务端节点 ID（base32）
	Path        string // "direct"=直连 / "relay"=中继 / ""=未知
	PathText    string // 路径的人类可读描述："直连 10.0.0.2:1234" / "中继" / "路径探测中"
	RemoteAddr  string
	LastError   string
	ConnectedAt time.Time
	Attempts    int
}

// Logf 是日志输出函数（由调用方决定写到哪里、是否加时间戳）。
type Logf func(format string, args ...any)

// Tunnel 维护到服务端的 iroh 连接，并在断开后自动重连。
//
// 零值不可用，请用 New 构造；Start 之后即可并发调用 Acquire。
type Tunnel struct {
	ep       *iroh.Endpoint
	serverID key.EndpointID
	localID  key.EndpointID
	logf     Logf
	// logImportant 是「不该被静音」的那一路日志：连接失败、被拒、掉线。
	// 正常状态（正在连接、已就绪）走 logf，可以被 --quiet 压掉；
	// 但失败路径必须留出声——否则双击启动（--quiet 模式）失败时，
	// 用户面对的是一个完全沉默的窗口，无从判断哪里出了问题。
	logImportant Logf

	mu          sync.RWMutex
	conn        *iroh.Conn
	state       State
	path        string
	remoteAddr  string
	lastErr     string
	connectedAt time.Time
	attempts    int

	cancel context.CancelFunc
	done   chan struct{}
}

// New 绑定本机 iroh 节点。serverID 是服务端节点 ID。
func New(ctx context.Context, sk key.SecretKey, serverID key.EndpointID, logf Logf) (*Tunnel, error) {
	if logf == nil {
		logf = func(string, ...any) {}
	}
	ep, err := iroh.Bind(ctx,
		iroh.WithSecretKey(sk),
		iroh.WithALPNs(ALPN),
		// 默认是 relay.ModeDisabled（纯直连）——必须显式打开，
		// 否则在没有公网直连路径时根本连不上服务端。
		iroh.WithRelayMode(relay.ModeDefault()),
		// number0 生产环境的 DNS(pkarr) 发现：把节点 ID 解析成可达地址。
		iroh.WithDNSResolver(nil),
	)
	if err != nil {
		return nil, fmt.Errorf("绑定 iroh 节点失败：%w", err)
	}
	return &Tunnel{
		ep:       ep,
		serverID: serverID,
		localID:  ep.ID(),
		logf:     logf,
		// 默认：重要性日志跟普通日志走同一路（兼容既有调用方）
		logImportant: logf,
		state:        StateIdle,
		done:         make(chan struct{}),
	}, nil
}

// SetImportantLogf 指定「不被静音」的日志出口。
//
// 调用方在 --quiet（如双击启动）时用它把失败信息救出来：普通 logf 静音，
// 这一路仍然写出去。传 nil 表示恢复成与 logf 相同。
func (t *Tunnel) SetImportantLogf(logf Logf) {
	if logf == nil {
		logf = t.logf
	}
	t.mu.Lock()
	t.logImportant = logf
	t.mu.Unlock()
}

// LocalID 返回本机节点 ID。
func (t *Tunnel) LocalID() key.EndpointID { return t.localID }

// PeerID 返回服务端节点 ID。
func (t *Tunnel) PeerID() key.EndpointID { return t.serverID }

// Start 启动后台连接/重连循环，立即返回。
func (t *Tunnel) Start(ctx context.Context) {
	ctx, cancel := context.WithCancel(ctx)
	t.mu.Lock()
	if t.cancel != nil {
		t.mu.Unlock()
		cancel()
		return
	}
	t.cancel = cancel
	t.mu.Unlock()

	// 尽力等一次中继就绪，让首连更稳；失败不影响后续 Connect（内部还会自己发现）。
	go func() {
		octx, ocancel := context.WithTimeout(ctx, 5*time.Second)
		defer ocancel()
		_ = t.ep.Online(octx)
	}()

	go t.run(ctx)
}

// run 是唯一的连接驱动者：连上 → 等断开 → 重连，直到 ctx 结束。
func (t *Tunnel) run(ctx context.Context) {
	defer close(t.done)
	for {
		if ctx.Err() != nil {
			return
		}

		conn, err := t.dial(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			t.onFail(err)
			wait := t.backoff()
			select {
			case <-ctx.Done():
				return
			case <-time.After(wait):
			}
			continue
		}

		t.onReady(conn)
		watchCtx, stopWatch := context.WithCancel(ctx)
		go t.watchPath(watchCtx, conn)

		// 挂起直到连接结束（正常断开 / 网络切换 / 服务端重启 / 被移出白名单）
		<-conn.Context().Done()
		stopWatch()
		t.onLost(conn)

		if ctx.Err() != nil {
			return
		}
		t.logImportant("与服务端的连接断开，准备重连")
	}
}

// dial 建一次连接，并做存活确认。
func (t *Tunnel) dial(ctx context.Context) (*iroh.Conn, error) {
	dctx, cancel := context.WithTimeout(ctx, dialTimeout)
	defer cancel()

	conn, err := t.ep.Connect(dctx, netaddr.NewEndpointAddr(t.serverID), ALPN)
	if err != nil {
		return nil, err
	}

	// QUIC 握手成功 ≠ 授权通过：服务端是在 accept 之后才校验白名单并关闭连接，
	// 所以这里必须再等一小段确认连接还活着，否则会把「被拒」当成「已连上」。
	timer := time.NewTimer(livenessWait)
	defer timer.Stop()
	select {
	case <-timer.C:
		return conn, nil
	case <-conn.Context().Done():
		_ = conn.Close()
		return nil, ErrRejected
	case <-ctx.Done():
		_ = conn.Close()
		return nil, ctx.Err()
	}
}

// Acquire 取当前连接；未就绪时最多等 wait，超时返回错误。
func (t *Tunnel) Acquire(ctx context.Context, wait time.Duration) (*iroh.Conn, error) {
	deadline := time.Now().Add(wait)
	for {
		t.mu.RLock()
		conn, state, detail := t.conn, t.state, t.lastErr
		t.mu.RUnlock()

		if conn != nil {
			return conn, nil
		}
		// 明确未授权：不必干等，直接给出可操作的提示
		if state == StateRejected {
			return nil, fmt.Errorf("%w：%s", ErrRejected, detail)
		}
		if !time.Now().Before(deadline) {
			if detail != "" {
				return nil, fmt.Errorf("%w（%s：%s）", ErrNotReady, state, detail)
			}
			return nil, fmt.Errorf("%w（%s）", ErrNotReady, state)
		}
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(150 * time.Millisecond):
		}
	}
}

// Status 返回状态快照。
func (t *Tunnel) Status() Status {
	t.mu.RLock()
	defer t.mu.RUnlock()
	st := Status{
		State:       t.state,
		LocalID:     nodeIDString(t.localID),
		PeerID:      nodeIDString(t.serverID),
		Path:        t.path,
		RemoteAddr:  t.remoteAddr,
		LastError:   t.lastErr,
		ConnectedAt: t.connectedAt,
		Attempts:    t.attempts,
	}
	st.PathText = pathText(st.Path, st.RemoteAddr)
	return st
}

// Close 关闭隧道与 iroh 节点。
func (t *Tunnel) Close() {
	t.mu.Lock()
	cancel := t.cancel
	started := t.cancel != nil
	conn := t.conn
	t.cancel = nil
	t.conn = nil
	t.state = StateClosed
	t.mu.Unlock()

	if cancel != nil {
		cancel()
	}
	if conn != nil {
		_ = conn.Close()
	}
	ctx, cancelShutdown := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancelShutdown()
	_ = t.ep.Shutdown(ctx)

	// 只有跑过连接循环才需要等它退出（id / status 这类命令从没 Start 过）
	if !started {
		return
	}
	select {
	case <-t.done:
	case <-time.After(3 * time.Second):
	}
}

// Wait 等待连接循环退出（Close 之后调用）。
func (t *Tunnel) Wait() { <-t.done }

// ---------- 状态迁移 ----------

func (t *Tunnel) onFail(err error) {
	t.mu.Lock()
	t.attempts++
	attempt := t.attempts
	t.lastErr = err.Error()
	if errors.Is(err, ErrRejected) {
		t.state = StateRejected
	} else if attempt == 1 {
		t.state = StateConnecting
	} else {
		t.state = StateReconnecting
	}
	t.mu.Unlock()

	// 状态迁移的日志走「重要」这一路：
	//  - 首次连接中（第 1 次失败）会被下一行压掉，避免刷屏
	//  - 反复失败 / 未授权 / 掉线 必须说，用户才知道要处理
	if errors.Is(err, ErrRejected) {
		t.logImportant("连接被拒（第 %d 次）：服务端握手后立即断开，通常是本节点未获授权", attempt)
		t.logImportant("  请到服务端 MeNote 后台「P2P 管理」授权本机节点：%s", nodeIDString(t.localID))
		return
	}
	if attempt == 1 {
		// 首连失败很可能是服务端还没起，且 5s 后就会重试——只在这条留个底
		t.logf("连接失败（第 %d 次）：%s", attempt, err)
		return
	}
	t.logImportant("连接失败（第 %d 次）：%s", attempt, err)
}

func (t *Tunnel) onReady(conn *iroh.Conn) {
	t.mu.Lock()
	t.conn = conn
	t.state = StateReady
	t.connectedAt = time.Now()
	t.attempts = 0
	t.lastErr = ""
	t.mu.Unlock()

	t.refreshPath(conn)
	t.logf("已连接服务端（%s）", t.pathDesc())
}

func (t *Tunnel) onLost(conn *iroh.Conn) {
	t.mu.Lock()
	// 只清当前登记的那条，避免旧连接的 closed 回调误删新连接。
	// connectedAt / path / remoteAddr 必须一起清：留着它们会让断线期间的
	// 「已连接时长」继续涨、路径还显示上一次的直连地址，全是假信息。
	if t.conn == conn {
		t.conn = nil
		t.state = StateReconnecting
		t.connectedAt = time.Time{}
		t.path = ""
		t.remoteAddr = ""
	}
	t.mu.Unlock()
}

func (t *Tunnel) backoff() time.Duration {
	t.mu.RLock()
	attempt := t.attempts
	t.mu.RUnlock()
	if attempt < 1 {
		attempt = 1
	}
	d := retryBase << (attempt - 1)
	if d <= 0 || d > retryMax {
		d = retryMax
	}
	return d
}

func (t *Tunnel) pathDesc() string {
	t.mu.RLock()
	defer t.mu.RUnlock()
	return pathText(t.path, t.remoteAddr)
}

// pathText 把「路径类型 + 对端地址」转成人类可读描述。
//
// 直连时带上对端地址（"直连 10.0.0.2:55793"）比只说"直连"有用得多——
// 打洞成功但走的仍是内网地址、还是真的走了公网路径，一眼能分辨。
func pathText(path, addr string) string {
	switch path {
	case "direct":
		if addr != "" {
			return "直连 " + addr
		}
		return "直连 P2P"
	case "relay":
		return "中继"
	}
	return "路径探测中"
}

// refreshPath 更新连接方式（直连 / 中继）。
func (t *Tunnel) refreshPath(conn *iroh.Conn) {
	paths := conn.Paths()
	var sel *iroh.PathInfo
	for i := range paths {
		if paths[i].Selected {
			sel = &paths[i]
			break
		}
	}
	if sel == nil {
		for i := range paths {
			if paths[i].Validated {
				sel = &paths[i]
				break
			}
		}
	}
	if sel == nil {
		return
	}
	kind := "direct"
	if sel.Relayed {
		kind = "relay"
	}
	addr := ""
	if sel.HasAddr {
		addr = sel.Addr.String()
	}

	t.mu.Lock()
	changed := t.path != "" && t.path != kind
	t.path, t.remoteAddr = kind, addr
	t.mu.Unlock()

	if changed {
		// 中继→直连 的切换是用户能感知到的（速度变了），值得说
		t.logImportant("连接方式切换：%s", t.pathDesc())
	}
}

func (t *Tunnel) watchPath(ctx context.Context, conn *iroh.Conn) {
	tick := time.NewTicker(pathPollInterval)
	defer tick.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-conn.Context().Done():
			return
		case <-tick.C:
			t.refreshPath(conn)
		}
	}
}

// nodeIDString 统一走 nodeid 包，避免两套 base32 实现漂移。
func nodeIDString(id key.EndpointID) string { return nodeid.Encode(id) }

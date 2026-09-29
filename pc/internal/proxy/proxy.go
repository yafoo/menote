// Package proxy 在本地起一个 HTTP 服务，把浏览器请求经 iroh QUIC 转发给远端 MeNote。
//
// 与安卓端 IrohProxy 的差别只在实现手段：安卓手写 HTTP/1.1 字节解析 +
// 缓冲整个响应，这里直接用 net/http 的原生能力 ——
//
//	浏览器 → 本机 127.0.0.1:3107（http.Server）
//	  → 自定义 RoundTripper：每请求开一条 QUIC 双向流
//	  → 服务端 lib/p2p.js → jj.js 应用栈
//
// 请求/响应报文由 http.Request.Write 与 http.ReadResponse 生成和解析，
// chunked、Content-Length、大文件流式下载都由标准库保证，不缓冲整个响应。
package proxy

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"html/template"
	"io"
	"net"
	"net/http"
	"net/http/httputil"
	"strconv"
	"sync"
	"time"

	"github.com/tmc/go-iroh/iroh"

	"menote-pc/internal/tunnel"
)

// acquireWait 隧道未就绪时单个请求最多等待的时长。
// 取值要大于「重连 + 一次请求」的常见耗时，又不至于让浏览器以为页面挂了。
const acquireWait = 10 * time.Second

// PortTries 端口被占用时向上递增尝试的次数。
const PortTries = 11

// ProxyHeader 标记响应来自本代理。
//
// 端口会因占用而自动 +1，命令行（open / status）没有内存里的实际端口，
// 靠这个头在候选区间里认出「哪个端口才是我们的代理」——
// 否则本机同时跑着 MeNote 时会误判成它。
const ProxyHeader = "X-Menote-Pc-Proxy"

// PingPath 是代理的探测端点，专供 FindRunning 快速认领端口。
//
// 必须存在的原因：隧道没就绪时，普通请求会被 Acquire 挡住最多 acquireWait
// 才吐出 502 提示页。探测方不可能为每个候选端口等 10 秒，于是超时 → 误判
// 「代理未运行」。这个路径不进隧道，立即应答。
const PingPath = "/__menote_pc__/ping"

// StatusPath 是代理自报运行时状态的端点（同样就地应答，不进隧道）。
//
// 为什么需要它：`run` 是一个进程，`status` 是另一个进程，后者读不到前者内存里
// 的隧道状态（连没连上、走的直连还是中继）。走一个回环 HTTP 端点是最省的跨进程
// 通道——不必再引入 pid 文件、Unix socket 或命名管道那套平台差异。
const StatusPath = "/__menote_pc__/status"

// Proxy 是本地 HTTP 代理。
type Proxy struct {
	t    *tunnel.Tunnel
	logf tunnel.Logf
	// impLogf 是「不被静音」的日志出口：端口顺延、请求失败这类必须说的事。
	// 默认与 logf 相同；--quiet 时由 main 指向 logger.logImportant。
	impLogf tunnel.Logf

	// Verbose 为真时打印每条请求的日志（--quiet 关掉）。
	Verbose bool

	// Version 是本程序的版本号，仅用于 StatusPath 自报（由 main 注入）。
	Version string

	srv       *http.Server
	ln        net.Listener
	addr      string
	boundPort int

	ready     chan struct{}
	readyOnce sync.Once
}

// New 构造代理（不监听）。
func New(t *tunnel.Tunnel, logf tunnel.Logf) *Proxy {
	if logf == nil {
		logf = func(string, ...any) {}
	}
	return &Proxy{t: t, logf: logf, impLogf: logf, ready: make(chan struct{})}
}

// SetImportantLogf 指定不被静音的那一路日志（传 nil 恢复成与 logf 相同）。
func (p *Proxy) SetImportantLogf(logf tunnel.Logf) {
	if logf == nil {
		logf = p.logf
	}
	p.impLogf = logf
}

// Ready 在监听成功后关闭，供调用方等实际端口就绪。
func (p *Proxy) Ready() <-chan struct{} { return p.ready }

// ListenAndServe 监听并开始服务，阻塞直到出错或被 Stop。
//
// 端口占用时自动向上递增（3107 → 3108 → …），最多试 PortTries 个，
// 与安卓端行为一致。判定占用不只看 bind 是否失败，见 portInUse。
func (p *Proxy) ListenAndServe(listen string, port int) error {
	ln, boundPort, err := listenWithFallback(listen, port, p.logf)
	if err != nil {
		return err
	}
	p.ln = ln
	p.addr = fmt.Sprintf("http://%s", ln.Addr().String())
	p.boundPort = boundPort

	rp := &httputil.ReverseProxy{
		Rewrite: func(pr *httputil.ProxyRequest) {
			// 目标 URL 只是占位：真正的传输由自定义 RoundTripper 接管，
			// Request.Write 始终写 origin-form（/path?query），不会用到 Host。
			pr.Out.URL.Scheme = "http"
			pr.Out.URL.Host = "menote.internal"
			// 保留浏览器发来的 Host（与安卓端一致：WebView 发什么就转什么）
			pr.Out.Host = pr.In.Host
		},
		Transport:      &tunnelTransport{t: p.t},
		ModifyResponse: p.logResponse,
		ErrorHandler:   p.errorHandler,
	}

	p.srv = &http.Server{
		Handler:           p.handler(rp),
		ReadHeaderTimeout: 15 * time.Second,
		// 不设 WriteTimeout：附件下载、大响应可能很久。
		// 读 body 也不设限，交给传输层。
	}

	if boundPort != port {
		// 端口被顺延：用户的固定端口失灵了，必须说（哪怕 --quiet）
		p.impLogf("本地代理已监听 %s（%d 被占用，已改用 %d）", p.addr, port, boundPort)
	} else {
		p.logf("本地代理已监听 %s（隧道就绪前访问会看到 502 提示页）", p.addr)
	}
	p.readyOnce.Do(func() { close(p.ready) })

	err = p.srv.Serve(ln)
	if errors.Is(err, http.ErrServerClosed) {
		return nil
	}
	return err
}

// handler 包一层：两个自带端点就地应答，其余全部交给反向代理。
func (p *Proxy) handler(rp *httputil.ReverseProxy) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case PingPath:
			w.Header().Set(ProxyHeader, "1")
			w.Header().Set("Content-Type", "text/plain; charset=utf-8")
			w.Header().Set("Cache-Control", "no-store")
			_, _ = io.WriteString(w, "menote-pc")
			return
		case StatusPath:
			p.writeStatus(w)
			return
		}
		rp.ServeHTTP(w, r)
	})
}

// StatusResponse 是 GET StatusPath 的响应体。
//
// 只在本机回环上暴露：里面有节点 ID 和最近一次错误原文，虽然都不是机密
// （节点 ID 本来就要填到服务端后台），但没有理由让它离开 loopback。
type StatusResponse struct {
	Version string       `json:"version"`
	Port    int          `json:"port"`
	URL     string       `json:"url"`
	Tunnel  TunnelStatus `json:"tunnel"`
}

// TunnelStatus 是隧道状态的可序列化快照。
type TunnelStatus struct {
	State         string `json:"state"`      // idle/connecting/ready/reconnecting/rejected/closed
	StateText     string `json:"state_text"` // 中文文案
	Path          string `json:"path"`       // direct/relay/""
	PathText      string `json:"path_text"`  // "直连 10.0.0.2:1234" / "中继" / "路径探测中"
	RemoteAddr    string `json:"remote_addr,omitempty"`
	LocalID       string `json:"local_id"`
	PeerID        string `json:"peer_id"`
	ConnectedAt   string `json:"connected_at,omitempty"`
	UptimeSeconds int64  `json:"uptime_seconds"`
	Attempts      int    `json:"attempts"`
	LastError     string `json:"last_error,omitempty"`
}

// writeStatus 输出代理与隧道的运行时状态。
func (p *Proxy) writeStatus(w http.ResponseWriter) {
	st := p.t.Status()
	out := StatusResponse{
		Version: p.Version,
		Port:    p.boundPort,
		URL:     p.addr,
		Tunnel: TunnelStatus{
			State:      st.State.Key(),
			StateText:  st.State.String(),
			Path:       st.Path,
			PathText:   st.PathText,
			RemoteAddr: st.RemoteAddr,
			LocalID:    st.LocalID,
			PeerID:     st.PeerID,
			Attempts:   st.Attempts,
			LastError:  st.LastError,
		},
	}
	if !st.ConnectedAt.IsZero() {
		out.Tunnel.ConnectedAt = st.ConnectedAt.Format(time.RFC3339)
		out.Tunnel.UptimeSeconds = int64(time.Since(st.ConnectedAt).Seconds())
	}

	w.Header().Set(ProxyHeader, "1")
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	_ = enc.Encode(out)
}

// ErrNoProxy 表示候选端口区间里没有任何代理在应答。
//
// 单独拎出来是为了让调用方能区分「代理没跑」和「代理在跑但状态读不出来」——
// 前者该提示用户去 run，后者是真出问题了，混在一句话里会误导。
var ErrNoProxy = errors.New("候选端口上没有任何代理应答")

// FetchStatus 在候选端口区间里找到正在运行的代理，并读取它的运行时状态。
//
// 与 FindRunning 一样只认带 ProxyHeader 的响应（避免把本机 MeNote 误认成代理），
// 命中后返回实际端口——端口会因占用自动 +1，调用方不能假设就是配置里那个。
func FetchStatus(host string, port int) (*StatusResponse, int, error) {
	if host == "" {
		host = "127.0.0.1"
	}
	// 显式禁用代理：不能让系统 HTTP 代理（HTTP_PROXY）掺和回环探测
	client := &http.Client{
		Timeout:   1500 * time.Millisecond,
		Transport: &http.Transport{Proxy: nil},
	}
	for i := 0; i < PortTries; i++ {
		candidate := port + i
		url := fmt.Sprintf("http://%s%s", net.JoinHostPort(host, strconv.Itoa(candidate)), StatusPath)
		resp, err := client.Get(url)
		if err != nil {
			continue
		}
		if resp.Header.Get(ProxyHeader) != "1" {
			_ = resp.Body.Close()
			continue
		}
		var out StatusResponse
		decErr := json.NewDecoder(io.LimitReader(resp.Body, 256*1024)).Decode(&out)
		_ = resp.Body.Close()
		if decErr != nil {
			return nil, candidate, fmt.Errorf("解析代理状态失败：%w", decErr)
		}
		return &out, candidate, nil
	}
	return nil, 0, ErrNoProxy
}

// Addr 返回实际监听地址（形如 http://127.0.0.1:3107），未监听时为空。
func (p *Proxy) Addr() string { return p.addr }

// Stop 优雅关闭本地代理。
func (p *Proxy) Stop() {
	if p.srv == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	_ = p.srv.Shutdown(ctx)
}

// listenWithFallback 在指定地址上监听，端口被占用则 +1 重试。
func listenWithFallback(host string, port int, logf tunnel.Logf) (net.Listener, int, error) {
	if host == "" {
		host = "127.0.0.1"
	}
	var lastErr error
	for i := 0; i < PortTries; i++ {
		candidate := port + i

		// 先探测再 bind：只靠 Listen 报错判断不出来「本机已经跑着一个服务」。
		// Windows 允许 127.0.0.1:3107 与 0.0.0.0:3107 同时 bind（不像 Linux
		// 直接 EADDRINUSE），于是本机同时跑着 MeNote 时，代理会 bind 成功并
		// 悄悄把回环流量抢过来——用户看到的是"代理打开了本机自己的 MeNote"，
		// 而不是走隧道的远端实例。显式探一次端口就能避开。
		if portInUse(host, candidate) {
			lastErr = fmt.Errorf("端口 %d 已被占用", candidate)
			if i < PortTries-1 {
				logf("端口 %d 已被占用，尝试 %d…", candidate, candidate+1)
			}
			continue
		}

		ln, err := net.Listen("tcp", net.JoinHostPort(host, strconv.Itoa(candidate)))
		if err == nil {
			return ln, candidate, nil
		}
		lastErr = err
		if i < PortTries-1 {
			logf("端口 %d 无法监听（%v），尝试 %d…", candidate, err, candidate+1)
		}
	}
	return nil, 0, fmt.Errorf("端口 %d~%d 全部被占用：%w", port, port+PortTries-1, lastErr)
}

// portInUse 判断本机某端口是否已有服务在应答。
//
// 同时探 host 与 127.0.0.1：我们最终要占的是回环地址，只要回环上已经有人
// 应答（哪怕对方 bind 的是 0.0.0.0 或 [::]），这个端口就不能用。
func portInUse(host string, port int) bool {
	targets := []string{net.JoinHostPort("127.0.0.1", strconv.Itoa(port))}
	if host != "127.0.0.1" && host != "localhost" && host != "::1" {
		targets = append(targets, net.JoinHostPort(host, strconv.Itoa(port)))
	}
	for _, t := range targets {
		c, err := net.DialTimeout("tcp", t, 300*time.Millisecond)
		if err == nil {
			_ = c.Close()
			return true
		}
	}
	return false
}

// logResponse 标记响应来源并记录每条请求的结果。
func (p *Proxy) logResponse(resp *http.Response) error {
	resp.Header.Set(ProxyHeader, "1")
	if !p.Verbose {
		return nil
	}
	if req := resp.Request; req != nil {
		p.logf("%s %s → %d", req.Method, req.URL.RequestURI(), resp.StatusCode)
	}
	return nil
}

// FindRunning 在 [port, port+PortTries) 里找出正在运行的本地代理端口。
//
// 探的是 PingPath（代理就地应答、不经过隧道），因此隧道断着也能认出来；
// 只认带 ProxyHeader 的响应，所以不会把「本机自己跑的 MeNote」误当成代理。
func FindRunning(host string, port int) (int, bool) {
	if host == "" {
		host = "127.0.0.1"
	}
	// 显式禁用代理：不能让系统 HTTP 代理（HTTP_PROXY）掺和回环探测
	client := &http.Client{
		Timeout:   800 * time.Millisecond,
		Transport: &http.Transport{Proxy: nil},
	}
	for i := 0; i < PortTries; i++ {
		candidate := port + i
		url := fmt.Sprintf("http://%s%s", net.JoinHostPort(host, strconv.Itoa(candidate)), PingPath)
		resp, err := client.Get(url)
		if err != nil {
			continue
		}
		hit := resp.Header.Get(ProxyHeader) == "1"
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
		_ = resp.Body.Close()
		if hit {
			return candidate, true
		}
	}
	return 0, false
}

// errorHandler 在隧道不可用时给出可操作的提示页，而不是干巴巴的 502。
func (p *Proxy) errorHandler(w http.ResponseWriter, r *http.Request, err error) {
	st := p.t.Status()

	title := "隧道未就绪"
	hint := "本地代理已就绪，但还没连上远端 MeNote，稍后刷新即可。"
	switch {
	case errors.Is(err, tunnel.ErrRejected):
		title = "本节点未获授权"
		hint = "服务端已收到连接但立即断开——说明本机节点不在服务端的 P2P 白名单里。"
	case errors.Is(err, context.DeadlineExceeded):
		title = "等待隧道超时"
		hint = "远端 MeNote 可能离线，或网络暂时不通。"
	}

	// 请求失败即使 --quiet 也要说：用户看到的是一张 502 页面，
	// 窗口里再没有一条对应记录就无从排查
	p.impLogf("请求失败 %s %s：%v", r.Method, r.URL.RequestURI(), err)

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set(ProxyHeader, "1")
	w.WriteHeader(http.StatusBadGateway)

	data := struct {
		Title, Hint, State, Detail, LocalID, PeerID string
	}{
		Title:   title,
		Hint:    hint,
		State:   st.State.String(),
		Detail:  err.Error(),
		LocalID: st.LocalID,
		PeerID:  st.PeerID,
	}
	_ = errorPage.Execute(w, data)
}

var errorPage = template.Must(template.New("err").Parse(`<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{{.Title}} · MeNote PC</title>
<style>
 :root{color-scheme:light dark}
 body{margin:0;padding:48px 20px;font:15px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;
      background:#fff;color:#1f2937}
 .card{max-width:620px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;padding:28px 30px}
 h1{font-size:19px;margin:0 0 6px;font-weight:600}
 p.hint{margin:0 0 20px;color:#4b5563}
 dl{display:grid;grid-template-columns:auto 1fr;gap:8px 14px;margin:0;font-size:13px}
 dt{color:#6b7280}
 dd{margin:0;font-family:ui-monospace,Menlo,Consolas,monospace;word-break:break-all}
 code{background:#f3f4f6;padding:2px 6px;border-radius:4px;font-size:12px}
 ol{margin:14px 0 0;padding-left:22px;font-size:14px;color:#374151}
 @media (prefers-color-scheme:dark){
  body{background:#111827;color:#e5e7eb}
  .card{border-color:#374151}
  p.hint,ol{color:#9ca3af}
  dt{color:#6b7280}
  code{background:#1f2937}
 }
</style></head><body>
<div class="card">
  <h1>{{.Title}}</h1>
  <p class="hint">{{.Hint}}</p>
  <dl>
    <dt>隧道状态</dt><dd>{{.State}}</dd>
    <dt>本机节点 ID</dt><dd>{{.LocalID}}</dd>
    <dt>服务端节点 ID</dt><dd>{{.PeerID}}</dd>
    <dt>详细原因</dt><dd>{{.Detail}}</dd>
  </dl>
  <ol>
    <li>确认服务端 MeNote 正在运行（<code>npm run dev</code> 或 <code>npm start</code>）。</li>
    <li>打开服务端后台 →「P2P 管理」，把上面的<b>本机节点 ID</b> 加入白名单。</li>
    <li>授权后无需重启本程序，隧道会自动连上，刷新本页即可。</li>
  </ol>
</div>
</body></html>
`))

// ---------- 传输层：HTTP over iroh QUIC ----------

// tunnelTransport 把每个 HTTP 请求映射成一条 QUIC 双向流。
type tunnelTransport struct {
	t *tunnel.Tunnel
}

func (tt *tunnelTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	ctx := req.Context()

	conn, err := tt.t.Acquire(ctx, acquireWait)
	if err != nil {
		return nil, err
	}

	stream, err := conn.OpenStreamSync(ctx)
	if err != nil {
		return nil, fmt.Errorf("打开 QUIC 流失败：%w", err)
	}

	// 单流单请求：Close=true 让 Request.Write 写出 Connection: close，
	// 服务端据此在响应结束后收流（安卓端同样是这个语义）。
	outreq := req.Clone(ctx)
	outreq.Close = true

	if err := outreq.Write(stream); err != nil {
		stream.CancelWrite(0)
		_ = stream.Close()
		return nil, fmt.Errorf("写入请求失败：%w", err)
	}
	// 半关闭：请求写完即告知对端，响应仍可从同一流读回。
	if err := stream.CloseWrite(); err != nil {
		_ = stream.Close()
		return nil, fmt.Errorf("关闭发送方向失败：%w", err)
	}

	resp, err := http.ReadResponse(bufio.NewReader(stream), outreq)
	if err != nil {
		_ = stream.Close()
		return nil, fmt.Errorf("读取响应失败：%w", err)
	}
	resp.Body = &streamBody{ReadCloser: resp.Body, stream: stream}
	return resp, nil
}

// streamBody 保证响应体读完后一并关闭 QUIC 流。
type streamBody struct {
	io.ReadCloser
	stream *iroh.Stream
	once   sync.Once
}

func (b *streamBody) Close() error {
	err := b.ReadCloser.Close()
	b.once.Do(func() { _ = b.stream.Close() })
	return err
}

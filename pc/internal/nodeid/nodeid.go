// Package nodeid 处理 iroh 节点 ID 的编码与解析。
//
// 全链路统一 RFC 4648 base32（小写、52 字符、无填充），字母表 a-z + 2-7：
//   - 服务端 lib/p2p.js 的 toBase32Id()
//   - 安卓端 IrohProxy.hexToBase32Id()
//   - 本包 Encode()
//
// 三者一致，所以后台「P2P 管理」里显示成什么样，这里就该显示成什么样。
//
// ⚠ iroh 生态另有一套 z-base-32 编码（pkarr 域名用），字母表不同、
// 长度同样是 52，无法自动区分——不要混用（go-iroh 的 ParseEndpointID
// 会在识别出 z-base-32 时明确报错，而不是静默解析成另一个 ID）。
package nodeid

import (
	"encoding/base32"
	"fmt"
	"strings"

	"github.com/tmc/go-iroh/key"
)

var b32 = base32.StdEncoding.WithPadding(base32.NoPadding)

// Encode 把节点 ID 编成 RFC 4648 base32 小写字符串（52 字符）。
func Encode(id key.EndpointID) string {
	b := id.Bytes()
	return strings.ToLower(b32.EncodeToString(b[:]))
}

// Parse 解析节点 ID，base32(52) 与 hex(64) 都接受，返回归一化后的值。
func Parse(s string) (key.EndpointID, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return key.EndpointID{}, fmt.Errorf("节点 ID 为空")
	}
	id, err := key.ParseEndpointID(s)
	if err != nil {
		return key.EndpointID{}, fmt.Errorf(
			"节点 ID 格式不正确（需 base32 52 字符或 hex 64 字符）：%q", s)
	}
	return id, nil
}

// Normalize 把任意可接受的写法统一成 base32 字符串。
func Normalize(s string) (string, error) {
	id, err := Parse(s)
	if err != nil {
		return "", err
	}
	return Encode(id), nil
}

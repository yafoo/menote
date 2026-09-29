//go:build !windows

package main

import (
	"os"
	"strings"
)

// isInteractive 报告 stdin 是否连着终端。
//
// 两步：先排除管道/普通文件（不是字符设备），再看字符设备**指向什么** ——
// `/dev/null` 也是字符设备，光看 ModeCharDevice 会把它当成终端。终端设备的
// 名字里带 tty（Linux 的 pts/N、macOS 的 ttysNNN），null 设备则叫 null。
//
// 真要严谨可以 ioctl(TIOCGETA/TCGETS) 探一次，但这里只用来决定「要不要
// 打横幅、要不要等按键」，误判的代价只是多几行字，不值得再引一层平台代码。
func isInteractive() bool {
	fi, err := os.Stdin.Stat()
	if err != nil {
		return false
	}
	if fi.Mode()&os.ModeCharDevice == 0 {
		return false
	}
	name := strings.ToLower(fi.Name())
	if strings.Contains(name, "null") {
		return false
	}
	return strings.Contains(name, "tty")
}

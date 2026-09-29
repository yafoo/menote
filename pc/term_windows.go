//go:build windows

package main

import (
	"os"
	"syscall"
	"unsafe"
)

var (
	kernel32           = syscall.NewLazyDLL("kernel32.dll")
	procGetConsoleMode = kernel32.NewProc("GetConsoleMode")
)

// isInteractive 报告 stdin 是否连着一个真正的控制台。
//
// 用 GetConsoleMode 而不是看 ModeCharDevice：Windows 的 NUL 设备同样是
// 字符设备，`< NUL`（双击时标准输入的状态）会被 ModeCharDevice 判成终端。
// GetConsoleMode 只对控制台句柄成功，对 NUL / 管道 / 文件一律
// ERROR_INVALID_HANDLE，语义正好就是我们要的。
//
// 走 syscall.NewLazyDLL 而非 cgo：本工程靠 CGO_ENABLED=0 做六平台交叉编译，
// 引入 cgo 会直接毁掉这条链路。好在 GetConsoleMode 是 kernel32 的桩函数，
// 手动调一下即可（这也正是 Go 的 console 检测在标准库里做的事）。
func isInteractive() bool {
	h := syscall.Handle(os.Stdin.Fd())
	var mode uint32
	r, _, _ := procGetConsoleMode.Call(uintptr(h), uintptr(unsafe.Pointer(&mode)))
	return r != 0
}

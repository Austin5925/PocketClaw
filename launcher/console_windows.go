//go:build windows

package main

import "syscall"

func initConsole() {
	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	setConsoleOutputCP := kernel32.NewProc("SetConsoleOutputCP")
	setConsoleOutputCP.Call(65001)
	setConsoleCP := kernel32.NewProc("SetConsoleCP")
	setConsoleCP.Call(65001)
}

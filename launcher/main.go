package main

import (
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"time"
)

const (
	gatewayPort = "18789"
	uiPort      = "3210"
)

var (
	baseDir string
	logFile *os.File
)

func main() {
	resolveBaseDir()
	setupLogging()
	defer logFile.Close()

	logMsg("PocketClaw 启动中...")
	logMsg("版本: " + readVersion())

	nodeBin := detectNode()
	if nodeBin == "" {
		showError("运行环境不完整：Node.js 未找到。\n请重新获取 PocketClaw 完整版本。")
		return
	}

	openclawBin := detectOpenClaw()
	if openclawBin == "" {
		showError("运行环境不完整：AI 引擎未找到。\n请重新获取 PocketClaw 完整版本。")
		return
	}

	if !fileExists(filepath.Join(baseDir, "app", "ui", "dist", "index.html")) {
		showError("运行环境不完整：界面文件未找到。\n请重新获取 PocketClaw 完整版本。")
		return
	}

	serverJs := filepath.Join(baseDir, "system", "server.js")
	if !fileExists(serverJs) {
		showError("运行环境不完整：服务脚本未找到。\n请重新获取 PocketClaw 完整版本。")
		return
	}

	os.Setenv("PATH", filepath.Dir(nodeBin)+string(os.PathListSeparator)+os.Getenv("PATH"))
	os.Setenv("OPENCLAW_HOME", filepath.Join(baseDir, "data", ".openclaw"))

	logMsg("正在启动 AI 引擎...")
	var gatewayCmd *exec.Cmd
	if runtime.GOOS == "windows" {
		gatewayCmd = exec.Command("cmd", "/c", openclawBin, "gateway", "--port", gatewayPort)
	} else {
		gatewayCmd = exec.Command("bash", openclawBin, "gateway", "--port", gatewayPort)
	}
	gatewayCmd.Dir = baseDir
	gatewayCmd.Stdout = logFile
	gatewayCmd.Stderr = logFile
	if err := gatewayCmd.Start(); err != nil {
		showError("AI 引擎启动失败: " + err.Error())
		return
	}

	if !waitForHealth("http://127.0.0.1:"+gatewayPort+"/health", 30) {
		showError("AI 引擎启动超时，请重试。")
		if gatewayCmd.Process != nil {
			gatewayCmd.Process.Kill()
		}
		return
	}
	logMsg("AI 引擎已启动")

	logMsg("正在启动界面...")
	uiCmd := exec.Command(nodeBin, serverJs)
	uiCmd.Dir = baseDir
	uiCmd.Stdout = logFile
	uiCmd.Stderr = logFile
	if err := uiCmd.Start(); err != nil {
		showError("界面启动失败: " + err.Error())
		if gatewayCmd.Process != nil {
			gatewayCmd.Process.Kill()
		}
		return
	}

	time.Sleep(time.Second)

	logMsg("正在打开浏览器...")
	openBrowser("http://localhost:" + uiPort)
	logMsg("PocketClaw 已启动！")

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	done := make(chan struct{})
	go func() {
		gatewayCmd.Wait()
		close(done)
	}()

	select {
	case <-sigCh:
	case <-done:
	}

	logMsg("正在关闭...")
	if gatewayCmd.Process != nil {
		gatewayCmd.Process.Kill()
	}
	if uiCmd.Process != nil {
		uiCmd.Process.Kill()
	}
	logMsg("已退出")
}

func resolveBaseDir() {
	exe, err := os.Executable()
	if err != nil {
		fmt.Fprintln(os.Stderr, "无法确定启动器位置")
		os.Exit(1)
	}
	dir := filepath.Dir(exe)

	if runtime.GOOS == "darwin" && strings.Contains(dir, ".app/Contents/MacOS") {
		baseDir = filepath.Dir(filepath.Dir(filepath.Dir(dir)))
	} else {
		baseDir = dir
	}
}

func setupLogging() {
	logPath := filepath.Join(baseDir, "data", "pocketclaw.log")
	var err error
	logFile, err = os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
	if err != nil {
		logFile = os.Stderr
	}
}

func logMsg(msg string) {
	ts := time.Now().Format("15:04:05")
	line := fmt.Sprintf("[%s] %s\n", ts, msg)
	logFile.WriteString(line)
	if runtime.GOOS == "windows" {
		fmt.Printf("[PocketClaw] %s\n", msg)
	}
}

func readVersion() string {
	data, err := os.ReadFile(filepath.Join(baseDir, "version.txt"))
	if err != nil {
		return "未知"
	}
	return strings.TrimSpace(string(data))
}

func detectNode() string {
	var p string
	switch runtime.GOOS {
	case "darwin":
		if runtime.GOARCH == "arm64" {
			p = filepath.Join(baseDir, "app", "runtime", "node-darwin-arm64", "bin", "node")
		} else {
			p = filepath.Join(baseDir, "app", "runtime", "node-darwin-x64", "bin", "node")
		}
	case "windows":
		p = filepath.Join(baseDir, "app", "runtime", "node-win-x64", "node.exe")
	}
	if fileExists(p) {
		return p
	}
	return ""
}

func detectOpenClaw() string {
	var p string
	if runtime.GOOS == "windows" {
		p = filepath.Join(baseDir, "app", "core", "node_modules", ".bin", "openclaw.cmd")
	} else {
		p = filepath.Join(baseDir, "app", "core", "node_modules", ".bin", "openclaw")
	}
	if fileExists(p) {
		return p
	}
	return ""
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func waitForHealth(url string, maxRetries int) bool {
	client := &http.Client{Timeout: 2 * time.Second}
	for i := 0; i < maxRetries; i++ {
		resp, err := client.Get(url)
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode == 200 {
				return true
			}
		}
		time.Sleep(time.Second)
	}
	return false
}

func openBrowser(url string) {
	switch runtime.GOOS {
	case "darwin":
		exec.Command("open", url).Start()
	case "windows":
		exec.Command("cmd", "/c", "start", url).Start()
	}
}

func showError(msg string) {
	logMsg("ERROR: " + msg)
	switch runtime.GOOS {
	case "darwin":
		exec.Command("osascript", "-e",
			fmt.Sprintf(`display dialog "%s" buttons {"确定"} with title "PocketClaw" with icon stop`, msg)).Run()
	case "windows":
		fmt.Fprintf(os.Stderr, "[PocketClaw ERROR] %s\n", msg)
		fmt.Println("按 Enter 键退出...")
		fmt.Scanln()
	}
}

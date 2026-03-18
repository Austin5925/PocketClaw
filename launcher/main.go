package main

import (
	"encoding/json"
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
	if runtime.GOOS == "windows" {
		exec.Command("cmd", "/c", "chcp 65001").Run()
	}

	resolveBaseDir()
	setupLogging()
	defer logFile.Close()

	logMsg("PocketClaw 启动中...")
	logMsg("版本: " + readVersion())
	logMsg("工作目录: " + baseDir)

	nodeBin := detectNode()
	if nodeBin == "" {
		showError("运行环境不完整：Node.js 未找到。\n请重新获取 PocketClaw 完整版本。")
		return
	}
	logMsg("Node.js: " + nodeBin)

	openclawEntry := detectOpenClawEntry()
	if openclawEntry == "" {
		showError("运行环境不完整：AI 引擎未找到。\n请重新获取 PocketClaw 完整版本。")
		return
	}
	logMsg("OpenClaw: " + openclawEntry)

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
	os.Setenv("OPENCLAW_GATEWAY_TOKEN", "pocketclaw-local")

	// Sync our config to OpenClaw's internal config (direct file write, no Node.js)
	logMsg("正在同步配置...")
	syncConfigToOpenClaw()

	// Start gateway — run Node.js directly with the JS entry point
	logMsg("正在启动 AI 引擎...")
	gatewayCmd := exec.Command(nodeBin, openclawEntry, "gateway", "--port", gatewayPort, "--token", "pocketclaw-local", "--allow-unconfigured")
	gatewayCmd.Dir = baseDir
	gatewayCmd.Stdout = logFile
	gatewayCmd.Stderr = logFile
	if err := gatewayCmd.Start(); err != nil {
		showError("AI 引擎启动失败: " + err.Error())
		return
	}

	// Monitor gateway process for early exit
	gatewayExited := make(chan error, 1)
	go func() {
		gatewayExited <- gatewayCmd.Wait()
	}()

	// Health check — no timeout, only exit if process crashes
	logMsg("等待 AI 引擎就绪...")
	healthy := false
	client := &http.Client{Timeout: 2 * time.Second}
	for elapsed := 0; ; elapsed++ {
		select {
		case err := <-gatewayExited:
			errMsg := "AI 引擎异常退出"
			if err != nil {
				errMsg += ": " + err.Error()
			}
			logMsg(errMsg)
			showErrorWithLog(errMsg)
			return
		default:
		}

		resp, err := client.Get("http://127.0.0.1:" + gatewayPort + "/health")
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode == 200 {
				healthy = true
				break
			}
		}

		if elapsed > 0 && elapsed%5 == 0 {
			logMsg(fmt.Sprintf("仍在加载中...（已等待 %d 秒）", elapsed))
		}
		time.Sleep(time.Second)
	}

	if !healthy {
		return
	}
	logMsg("AI 引擎已启动")

	// Start UI server
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
	logMsg("如果浏览器没有自动打开，请手动访问: http://localhost:" + uiPort)

	// Wait for signal or gateway exit
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	select {
	case <-sigCh:
	case <-gatewayExited:
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

// detectOpenClawEntry reads OpenClaw's package.json to find the actual JS entry point.
// This avoids using bin stubs (.cmd/.sh) which are platform-specific wrappers.
func detectOpenClawEntry() string {
	coreDir := filepath.Join(baseDir, "app", "core", "node_modules", "openclaw")
	pkgPath := filepath.Join(coreDir, "package.json")

	data, err := os.ReadFile(pkgPath)
	if err != nil {
		logMsg("无法读取 openclaw/package.json: " + err.Error())
		return ""
	}

	var pkg struct {
		Bin  interface{} `json:"bin"`
		Main string      `json:"main"`
	}
	if err := json.Unmarshal(data, &pkg); err != nil {
		logMsg("无法解析 openclaw/package.json: " + err.Error())
		return ""
	}

	// Try bin field first (can be string or map)
	switch b := pkg.Bin.(type) {
	case string:
		entry := filepath.Join(coreDir, b)
		if fileExists(entry) {
			return entry
		}
	case map[string]interface{}:
		for _, v := range b {
			if s, ok := v.(string); ok {
				entry := filepath.Join(coreDir, s)
				if fileExists(entry) {
					return entry
				}
			}
		}
	}

	// Fallback to main field
	if pkg.Main != "" {
		entry := filepath.Join(coreDir, pkg.Main)
		if fileExists(entry) {
			return entry
		}
	}

	// Last resort: common patterns
	for _, candidate := range []string{
		"bin/cli.js", "dist/cli.js", "cli.js", "bin/index.js", "dist/index.js",
	} {
		entry := filepath.Join(coreDir, candidate)
		if fileExists(entry) {
			return entry
		}
	}

	logMsg("无法定位 OpenClaw 入口文件")
	return ""
}

// syncConfigToOpenClaw reads our openclaw.json and writes key fields
// directly into OpenClaw's internal config file (no Node.js process needed).
func syncConfigToOpenClaw() {
	// Read our config
	ourConfigPath := filepath.Join(baseDir, "data", ".openclaw", "openclaw.json")
	ourData, err := os.ReadFile(ourConfigPath)
	if err != nil {
		logMsg("无法读取配置文件: " + err.Error())
		return
	}

	var ourConfig map[string]interface{}
	if err := json.Unmarshal(ourData, &ourConfig); err != nil {
		logMsg("无法解析配置文件: " + err.Error())
		return
	}

	// Read OpenClaw's internal config (create if doesn't exist)
	internalDir := filepath.Join(baseDir, "data", ".openclaw", ".openclaw")
	internalConfigPath := filepath.Join(internalDir, "openclaw.json")

	var internalConfig map[string]interface{}
	if internalData, err := os.ReadFile(internalConfigPath); err == nil {
		json.Unmarshal(internalData, &internalConfig)
	}
	if internalConfig == nil {
		internalConfig = make(map[string]interface{})
	}

	// Ensure gateway.auth.token
	gw, _ := internalConfig["gateway"].(map[string]interface{})
	if gw == nil {
		gw = make(map[string]interface{})
	}
	auth, _ := gw["auth"].(map[string]interface{})
	if auth == nil {
		auth = make(map[string]interface{})
	}
	auth["token"] = "pocketclaw-local"
	gw["auth"] = auth

	// Disable device identity checks for local-only deployment
	controlUi, _ := gw["controlUi"].(map[string]interface{})
	if controlUi == nil {
		controlUi = make(map[string]interface{})
	}
	controlUi["allowInsecureAuth"] = true
	controlUi["dangerouslyDisableDeviceAuth"] = true
	gw["controlUi"] = controlUi

	internalConfig["gateway"] = gw

	// Sync agent model (OpenClaw uses agents.defaults.model, not agent.model)
	if agent, ok := ourConfig["agent"].(map[string]interface{}); ok {
		if model, ok := agent["model"].(string); ok && model != "" {
			agents, _ := internalConfig["agents"].(map[string]interface{})
			if agents == nil {
				agents = make(map[string]interface{})
			}
			defaults, _ := agents["defaults"].(map[string]interface{})
			if defaults == nil {
				defaults = make(map[string]interface{})
			}
			defaults["model"] = model
			agents["defaults"] = defaults
			internalConfig["agents"] = agents
		}
	}

	// Sync provider API keys
	providers := []string{"minimax", "deepseek", "kimi", "moonshot", "qwen", "anthropic", "openai", "glm", "zhipu"}
	for _, provider := range providers {
		if providerCfg, ok := ourConfig[provider].(map[string]interface{}); ok {
			if apiKey, ok := providerCfg["apiKey"].(string); ok && apiKey != "" {
				internalProvider, _ := internalConfig[provider].(map[string]interface{})
				if internalProvider == nil {
					internalProvider = make(map[string]interface{})
				}
				internalProvider["apiKey"] = apiKey
				internalConfig[provider] = internalProvider
			}
		}
	}

	// Write back
	os.MkdirAll(internalDir, 0755)
	outData, err := json.MarshalIndent(internalConfig, "", "  ")
	if err != nil {
		logMsg("无法序列化配置: " + err.Error())
		return
	}
	if err := os.WriteFile(internalConfigPath, outData, 0644); err != nil {
		logMsg("无法写入内部配置: " + err.Error())
		return
	}
	logMsg("配置同步完成")
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
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
		fmt.Fprintf(os.Stderr, "\n[PocketClaw ERROR] %s\n", msg)
		fmt.Println("按 Enter 键退出...")
		fmt.Scanln()
	}
}

func showErrorWithLog(msg string) {
	logMsg("ERROR: " + msg)

	logPath := filepath.Join(baseDir, "data", "pocketclaw.log")
	logFile.Sync()
	logData, err := os.ReadFile(logPath)
	logTail := ""
	if err == nil {
		lines := strings.Split(strings.TrimSpace(string(logData)), "\n")
		start := 0
		if len(lines) > 30 {
			start = len(lines) - 30
		}
		logTail = strings.Join(lines[start:], "\n")
	}

	switch runtime.GOOS {
	case "darwin":
		exec.Command("osascript", "-e",
			fmt.Sprintf(`display dialog "%s" buttons {"确定"} with title "PocketClaw" with icon stop`, msg)).Run()
	case "windows":
		fmt.Fprintf(os.Stderr, "\n[PocketClaw ERROR] %s\n", msg)
		if logTail != "" {
			fmt.Println("\n--- 日志（用于排查问题）---")
			fmt.Println(logTail)
			fmt.Println("--- 日志结束 ---")
			fmt.Printf("\n完整日志: %s\n", logPath)
		}
		fmt.Println("\n按 Enter 键退出...")
		fmt.Scanln()
	}
}

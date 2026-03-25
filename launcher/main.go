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
	initConsole()
	resolveBaseDir()
	setupLogging()
	defer logFile.Close()

	logMsg("口袋龙虾启动中...")
	logMsg("版本: " + readVersion())
	logMsg("工作目录: " + baseDir)

	nodeBin := detectNode()
	if nodeBin == "" {
		logMsg("Node.js 未找到，尝试自动下载...")
		if autoSetup("node") {
			nodeBin = detectNode()
		}
		if nodeBin == "" {
			showError("运行环境不完整：Node.js 未找到。\n请重新获取口袋龙虾完整版本。")
			return
		}
	}
	logMsg("Node.js: " + nodeBin)

	openclawEntry := detectOpenClawEntry()
	if openclawEntry == "" {
		logMsg("OpenClaw 未找到，尝试自动安装...")
		if autoSetup("openclaw") {
			openclawEntry = detectOpenClawEntry()
		}
		if openclawEntry == "" {
			showError("运行环境不完整：AI 引擎未找到。\n请重新获取口袋龙虾完整版本。")
			return
		}
	}
	logMsg("OpenClaw: " + openclawEntry)

	if !fileExists(filepath.Join(baseDir, "app", "ui", "dist", "index.html")) {
		showError("运行环境不完整：界面文件未找到。\n请重新获取口袋龙虾完整版本。")
		return
	}

	serverJs := filepath.Join(baseDir, "system", "server.js")
	if !fileExists(serverJs) {
		showError("运行环境不完整：服务脚本未找到。\n请重新获取口袋龙虾完整版本。")
		return
	}

	os.Setenv("PATH", filepath.Dir(nodeBin)+string(os.PathListSeparator)+os.Getenv("PATH"))
	os.Setenv("OPENCLAW_HOME", filepath.Join(baseDir, "data", ".openclaw"))

	logMsg("正在同步配置...")
	syncConfigToOpenClaw()
	writeAuthProfiles()

	logMsg("正在启动 AI 引擎...")
	gatewayCmd := exec.Command(nodeBin, openclawEntry, "gateway", "--port", gatewayPort, "--allow-unconfigured")
	gatewayCmd.Dir = baseDir
	gatewayCmd.Stdout = logFile
	gatewayCmd.Stderr = logFile
	if err := gatewayCmd.Start(); err != nil {
		showError("AI 引擎启动失败: " + err.Error())
		return
	}

	gatewayExited := make(chan error, 1)
	go func() {
		gatewayExited <- gatewayCmd.Wait()
	}()

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
	logMsg("口袋龙虾已启动！")
	logMsg("如果浏览器没有自动打开，请手动访问: http://localhost:" + uiPort)

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM, syscall.SIGHUP)

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
	// .command / .bat launcher sets POCKETCLAW_BASE to the real portable directory,
	// which avoids macOS App Translocation pointing us to a temp path.
	if envBase := os.Getenv("POCKETCLAW_BASE"); envBase != "" {
		baseDir = envBase
		return
	}

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
	logFile, err = os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0600)
	if err != nil {
		logFile = os.Stderr
		return
	}
}

func logMsg(msg string) {
	ts := time.Now().Format("15:04:05")
	line := fmt.Sprintf("[%s] %s\n", ts, msg)
	logFile.WriteString(line)
	fmt.Printf("  %s\n", msg)
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

	// Local-only: no auth + no device identity checks
	gw, _ := internalConfig["gateway"].(map[string]interface{})
	if gw == nil {
		gw = make(map[string]interface{})
	}
	auth, _ := gw["auth"].(map[string]interface{})
	if auth == nil {
		auth = make(map[string]interface{})
	}
	auth["mode"] = "none"
	gw["auth"] = auth

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

	// Explicitly set workspace path so OpenClaw finds ClawHub skills.
	// Without this, OpenClaw defaults to ~/.openclaw/workspace/ which
	// doesn't contain the bundled skills we installed to $OPENCLAW_HOME/workspace/.
	{
		agents, _ := internalConfig["agents"].(map[string]interface{})
		if agents == nil {
			agents = make(map[string]interface{})
		}
		defaults, _ := agents["defaults"].(map[string]interface{})
		if defaults == nil {
			defaults = make(map[string]interface{})
		}
		defaults["workspace"] = filepath.Join(baseDir, "data", ".openclaw", "workspace")
		agents["defaults"] = defaults
		internalConfig["agents"] = agents
	}

	// Sync ALL provider configs from shared-config.json (single source of truth).
	// Must include ALL required fields (baseUrl, api, models) to pass Zod strict validation.
	models, _ := internalConfig["models"].(map[string]interface{})
	if models == nil {
		models = make(map[string]interface{})
	}
	modProviders, _ := models["providers"].(map[string]interface{})
	if modProviders == nil {
		modProviders = make(map[string]interface{})
	}

	// Build reverse mapping: OpenClaw provider name → UI config key
	// e.g. "moonshot" → "kimi" (from shared-config.json openclawId field)
	configKeyFor := make(map[string]string)
	for _, p := range loadSharedProviders() {
		if p.OpenClawID != "" {
			configKeyFor[p.OpenClawID] = p.ID
		}
	}

	providerEntries := loadProviderEntries()
	for providerKey, entry := range providerEntries {
		// Resolve API key: check UI config key first, then OpenClaw provider name
		configKey := providerKey
		if mapped, ok := configKeyFor[providerKey]; ok {
			configKey = mapped
		}
		if providerCfg, ok := ourConfig[configKey].(map[string]interface{}); ok {
			if apiKey, ok := providerCfg["apiKey"].(string); ok && apiKey != "" {
				entry["apiKey"] = apiKey
			}
		}
		if configKey != providerKey {
			if providerCfg, ok := ourConfig[providerKey].(map[string]interface{}); ok {
				if apiKey, ok := providerCfg["apiKey"].(string); ok && apiKey != "" {
					entry["apiKey"] = apiKey
				}
			}
		}
		modProviders[providerKey] = entry
	}
	models["providers"] = modProviders
	internalConfig["models"] = models

	// Pass channels config to OpenClaw ONLY if channel plugins are installed.
	corePlugins := filepath.Join(baseDir, "app", "core", "node_modules")
	homePlugins := filepath.Join(baseDir, "data", ".openclaw", "node_modules")
	_, errFeishuHome := os.Stat(filepath.Join(homePlugins, "@openclaw", "feishu"))
	_, errFeishuCore := os.Stat(filepath.Join(corePlugins, "@openclaw", "feishu"))
	_, errQQHome := os.Stat(filepath.Join(homePlugins, "@tencent-connect", "openclaw-qqbot"))
	_, errQQCore := os.Stat(filepath.Join(corePlugins, "@tencent-connect", "openclaw-qqbot"))
	hasPlugins := errFeishuHome == nil || errFeishuCore == nil || errQQHome == nil || errQQCore == nil
	if hasPlugins {
		if channels, ok := ourConfig["channels"].(map[string]interface{}); ok {
			internalConfig["channels"] = channels
		}
	} else {
		delete(internalConfig, "channels")
	}

	// Write back
	os.MkdirAll(internalDir, 0700)
	outData, err := json.MarshalIndent(internalConfig, "", "  ")
	if err != nil {
		logMsg("无法序列化配置: " + err.Error())
		return
	}
	if err := os.WriteFile(internalConfigPath, outData, 0600); err != nil {
		logMsg("无法写入内部配置: " + err.Error())
		return
	}
	logMsg("配置同步完成")
}

// loadProviderEntries loads all provider configs (baseUrl, api, models) from shared-config.json.
// Returns a map of providerKey → config entry for all providers that have baseUrl defined.
func loadProviderEntries() map[string]map[string]interface{} {
	cfgPath := filepath.Join(baseDir, "system", "shared-config.json")
	data, err := os.ReadFile(cfgPath)
	if err != nil {
		logMsg("无法读取 shared-config.json: " + err.Error())
		return nil
	}
	var raw map[string]interface{}
	if err := json.Unmarshal(data, &raw); err != nil {
		logMsg("无法解析 shared-config.json: " + err.Error())
		return nil
	}
	result := make(map[string]map[string]interface{})
	for key, val := range raw {
		if key == "providers" {
			continue
		}
		entry, ok := val.(map[string]interface{})
		if !ok || entry["baseUrl"] == nil {
			continue
		}
		// Deep-copy the entry so mutations (apiKey injection) don't affect the parsed data
		copied := make(map[string]interface{})
		for k, v := range entry {
			copied[k] = v
		}
		result[key] = copied
	}
	return result
}

// loadSharedProviders reads the provider list from system/shared-config.json.
// Falls back to an empty list on error (setProviderEnvVars / writeAuthProfiles become no-ops).
type sharedProvider struct {
	ID         string `json:"id"`
	OpenClawID string `json:"openclawId"`
	EnvVar     string `json:"envVar"`
}

// ResolvedID returns the OpenClaw provider name (openclawId if set, otherwise id).
func (p sharedProvider) ResolvedID() string {
	if p.OpenClawID != "" {
		return p.OpenClawID
	}
	return p.ID
}

// loadSharedProviders reads the provider list from system/shared-config.json.
// Falls back to an empty list on error (setProviderEnvVars / writeAuthProfiles become no-ops).
func loadSharedProviders() []sharedProvider {
	cfgPath := filepath.Join(baseDir, "system", "shared-config.json")
	data, err := os.ReadFile(cfgPath)
	if err != nil {
		logMsg("无法读取 shared-config.json: " + err.Error())
		return nil
	}
	var sc struct {
		Providers []sharedProvider `json:"providers"`
	}
	if err := json.Unmarshal(data, &sc); err != nil {
		logMsg("无法解析 shared-config.json: " + err.Error())
		return nil
	}
	return sc.Providers
}

// writeAuthProfiles creates auth-profiles.json for the agent auth store.
// Format verified from OpenClaw source: src/agents/auth-profiles/types.ts
func writeAuthProfiles() {
	configPath := filepath.Join(baseDir, "data", ".openclaw", "openclaw.json")
	data, err := os.ReadFile(configPath)
	if err != nil {
		return
	}
	var config map[string]interface{}
	if err := json.Unmarshal(data, &config); err != nil {
		return
	}

	profiles := make(map[string]interface{})
	for _, p := range loadSharedProviders() {
		if providerCfg, ok := config[p.ID].(map[string]interface{}); ok {
			if apiKey, ok := providerCfg["apiKey"].(string); ok && apiKey != "" {
				provider := p.ResolvedID()
				profileKey := provider + ":default"
				// Don't overwrite if already set by a higher-priority entry
				if profiles[profileKey] != nil {
					continue
				}
				profiles[profileKey] = map[string]interface{}{
					"type":     "api_key",
					"provider": provider,
					"key":      apiKey,
				}
			}
		}
	}

	if len(profiles) == 0 {
		return
	}

	store := map[string]interface{}{
		"version":  1,
		"profiles": profiles,
	}

	agentDir := filepath.Join(baseDir, "data", ".openclaw", ".openclaw", "agents", "main", "agent")
	os.MkdirAll(agentDir, 0700)
	outData, err := json.MarshalIndent(store, "", "  ")
	if err != nil {
		return
	}
	authPath := filepath.Join(agentDir, "auth-profiles.json")
	os.WriteFile(authPath, outData, 0600)
	logMsg("auth-profiles.json 已写入")
}

// autoSetup runs system/setup.sh (macOS) or system/setup.bat (Windows)
// to download missing runtime components (Node.js or OpenClaw).
func autoSetup(component string) bool {
	var setupCmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		setupPath := filepath.Join(baseDir, "system", "setup.sh")
		if !fileExists(setupPath) {
			logMsg("setup.sh 未找到，无法自动初始化")
			return false
		}
		logMsg("正在运行 setup.sh " + component + " ...")
		setupCmd = exec.Command("bash", setupPath, component)
	case "windows":
		setupPath := filepath.Join(baseDir, "system", "setup.bat")
		if !fileExists(setupPath) {
			logMsg("setup.bat 未找到，无法自动初始化")
			return false
		}
		logMsg("正在运行 setup.bat " + component + " ...")
		setupCmd = exec.Command("cmd", "/c", setupPath, component)
	default:
		return false
	}
	setupCmd.Dir = baseDir
	setupCmd.Stdout = logFile
	setupCmd.Stderr = logFile
	if err := setupCmd.Run(); err != nil {
		logMsg("自动初始化失败: " + err.Error())
		return false
	}
	logMsg("自动初始化完成")
	return true
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
	fmt.Fprintf(os.Stderr, "\n[口袋龙虾错误] %s\n", msg)
	fmt.Println("\n按 Enter 键退出...")
	fmt.Scanln()
}

func showErrorWithLog(msg string) {
	logMsg("ERROR: " + msg)

	logPath := filepath.Join(baseDir, "data", "pocketclaw.log")
	logFile.Sync()
	logData, err := os.ReadFile(logPath)
	if err == nil {
		lines := strings.Split(strings.TrimSpace(string(logData)), "\n")
		start := 0
		if len(lines) > 30 {
			start = len(lines) - 30
		}
		logTail := strings.Join(lines[start:], "\n")
		fmt.Println("\n--- 日志（用于排查问题）---")
		fmt.Println(logTail)
		fmt.Println("--- 日志结束 ---")
		fmt.Printf("\n完整日志: %s\n", logPath)
	}
	fmt.Fprintf(os.Stderr, "\n[口袋龙虾错误] %s\n", msg)
	fmt.Println("\n按 Enter 键退出...")
	fmt.Scanln()
}

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

	logMsg("PocketClaw starting...")
	logMsg("version: " + readVersion())
	logMsg("workdir: " + baseDir)

	nodeBin := detectNode()
	if nodeBin == "" {
		showError("Incomplete: Node.js not found.\nPlease re-download PocketClaw.")
		return
	}
	logMsg("Node.js: " + nodeBin)

	openclawEntry := detectOpenClawEntry()
	if openclawEntry == "" {
		showError("Incomplete: AI engine not found.\nPlease re-download PocketClaw.")
		return
	}
	logMsg("OpenClaw: " + openclawEntry)

	if !fileExists(filepath.Join(baseDir, "app", "ui", "dist", "index.html")) {
		showError("Incomplete: UI files not found.\nPlease re-download PocketClaw.")
		return
	}

	serverJs := filepath.Join(baseDir, "system", "server.js")
	if !fileExists(serverJs) {
		showError("Incomplete: server script not found.\nPlease re-download PocketClaw.")
		return
	}

	os.Setenv("PATH", filepath.Dir(nodeBin)+string(os.PathListSeparator)+os.Getenv("PATH"))
	os.Setenv("OPENCLAW_HOME", filepath.Join(baseDir, "data", ".openclaw"))

	logMsg("syncing config...")
	syncConfigToOpenClaw()
	setProviderEnvVars()
	writeAuthProfiles()

	logMsg("starting AI engine...")
	gatewayCmd := exec.Command(nodeBin, openclawEntry, "gateway", "--port", gatewayPort, "--allow-unconfigured")
	gatewayCmd.Dir = baseDir
	gatewayCmd.Stdout = logFile
	gatewayCmd.Stderr = logFile
	if err := gatewayCmd.Start(); err != nil {
		showError("AI engine failed to start: " + err.Error())
		return
	}

	gatewayExited := make(chan error, 1)
	go func() {
		gatewayExited <- gatewayCmd.Wait()
	}()

	logMsg("waiting for AI engine...")
	healthy := false
	client := &http.Client{Timeout: 2 * time.Second}
	for elapsed := 0; ; elapsed++ {
		select {
		case err := <-gatewayExited:
			errMsg := "AI engine exited unexpectedly"
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
			logMsg(fmt.Sprintf("still loading... (%d seconds)", elapsed))
		}
		time.Sleep(time.Second)
	}

	if !healthy {
		return
	}
	logMsg("AI engine ready")

	logMsg("starting UI server...")
	uiCmd := exec.Command(nodeBin, serverJs)
	uiCmd.Dir = baseDir
	uiCmd.Stdout = logFile
	uiCmd.Stderr = logFile
	if err := uiCmd.Start(); err != nil {
		showError("UI server failed to start: " + err.Error())
		if gatewayCmd.Process != nil {
			gatewayCmd.Process.Kill()
		}
		return
	}

	time.Sleep(time.Second)

	logMsg("opening browser...")
	openBrowser("http://localhost:" + uiPort)
	logMsg("PocketClaw started! http://localhost:" + uiPort)

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	select {
	case <-sigCh:
	case <-gatewayExited:
	}

	logMsg("shutting down...")
	if gatewayCmd.Process != nil {
		gatewayCmd.Process.Kill()
	}
	if uiCmd.Process != nil {
		uiCmd.Process.Kill()
	}
	logMsg("exited")
}

func resolveBaseDir() {
	exe, err := os.Executable()
	if err != nil {
		fmt.Fprintln(os.Stderr, "cannot determine launcher path")
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
		return
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
		return "unknown"
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
		logMsg("failed to read openclaw/package.json: " + err.Error())
		return ""
	}

	var pkg struct {
		Bin  interface{} `json:"bin"`
		Main string      `json:"main"`
	}
	if err := json.Unmarshal(data, &pkg); err != nil {
		logMsg("failed to parse openclaw/package.json: " + err.Error())
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

	logMsg("cannot locate OpenClaw entry file")
	return ""
}

// syncConfigToOpenClaw reads our openclaw.json and writes key fields
// directly into OpenClaw's internal config file (no Node.js process needed).
func syncConfigToOpenClaw() {
	// Read our config
	ourConfigPath := filepath.Join(baseDir, "data", ".openclaw", "openclaw.json")
	ourData, err := os.ReadFile(ourConfigPath)
	if err != nil {
		logMsg("failed to read config: " + err.Error())
		return
	}

	var ourConfig map[string]interface{}
	if err := json.Unmarshal(ourData, &ourConfig); err != nil {
		logMsg("failed to parse config: " + err.Error())
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

	// Sync provider API keys to models.providers.<id>.apiKey
	models, _ := internalConfig["models"].(map[string]interface{})
	if models == nil {
		models = make(map[string]interface{})
	}
	modProviders, _ := models["providers"].(map[string]interface{})
	if modProviders == nil {
		modProviders = make(map[string]interface{})
	}

	knownProviders := []string{"minimax", "deepseek", "kimi", "moonshot", "qwen", "anthropic", "openai", "glm", "zhipu"}
	for _, provider := range knownProviders {
		if providerCfg, ok := ourConfig[provider].(map[string]interface{}); ok {
			if apiKey, ok := providerCfg["apiKey"].(string); ok && apiKey != "" {
				mp, _ := modProviders[provider].(map[string]interface{})
				if mp == nil {
					mp = make(map[string]interface{})
				}
				mp["apiKey"] = apiKey
				modProviders[provider] = mp
			}
		}
	}

	models["providers"] = modProviders
	internalConfig["models"] = models

	// Write back
	os.MkdirAll(internalDir, 0755)
	outData, err := json.MarshalIndent(internalConfig, "", "  ")
	if err != nil {
		logMsg("failed to serialize config: " + err.Error())
		return
	}
	if err := os.WriteFile(internalConfigPath, outData, 0644); err != nil {
		logMsg("failed to write internal config: " + err.Error())
		return
	}
	logMsg("config synced")
}

// setProviderEnvVars sets API keys as env vars so OpenClaw's agent auth
// can find them via the env var fallback chain (verified from source).
func setProviderEnvVars() {
	configPath := filepath.Join(baseDir, "data", ".openclaw", "openclaw.json")
	data, err := os.ReadFile(configPath)
	if err != nil {
		return
	}
	var config map[string]interface{}
	if err := json.Unmarshal(data, &config); err != nil {
		return
	}

	// Mapping verified from OpenClaw source: extensions/*/openclaw.plugin.json
	envVarMap := map[string]string{
		"minimax":   "MINIMAX_API_KEY",
		"deepseek":  "DEEPSEEK_API_KEY",
		"openai":    "OPENAI_API_KEY",
		"anthropic": "ANTHROPIC_API_KEY",
		"moonshot":  "MOONSHOT_API_KEY",
		"kimi":      "MOONSHOT_API_KEY",
	}

	for provider, envVar := range envVarMap {
		if providerCfg, ok := config[provider].(map[string]interface{}); ok {
			if apiKey, ok := providerCfg["apiKey"].(string); ok && apiKey != "" {
				os.Setenv(envVar, apiKey)
			}
		}
	}
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
	knownProviders := []string{"minimax", "deepseek", "kimi", "moonshot", "qwen", "anthropic", "openai", "glm", "zhipu"}
	for _, provider := range knownProviders {
		if providerCfg, ok := config[provider].(map[string]interface{}); ok {
			if apiKey, ok := providerCfg["apiKey"].(string); ok && apiKey != "" {
				profiles[provider+":default"] = map[string]interface{}{
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
	os.MkdirAll(agentDir, 0755)
	outData, err := json.MarshalIndent(store, "", "  ")
	if err != nil {
		return
	}
	authPath := filepath.Join(agentDir, "auth-profiles.json")
	os.WriteFile(authPath, outData, 0644)
	logMsg("auth-profiles.json written")
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
			fmt.Sprintf(`display dialog "%s" buttons {"OK"} with title "PocketClaw" with icon stop`, msg)).Run()
	case "windows":
		fmt.Fprintf(os.Stderr, "\n[PocketClaw ERROR] %s\n", msg)
		fmt.Println("Press Enter to exit...")
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
			fmt.Sprintf(`display dialog "%s" buttons {"OK"} with title "PocketClaw" with icon stop`, msg)).Run()
	case "windows":
		fmt.Fprintf(os.Stderr, "\n[PocketClaw ERROR] %s\n", msg)
		if logTail != "" {
			fmt.Println("\n--- Log (for troubleshooting) ---")
			fmt.Println(logTail)
			fmt.Println("--- End of log ---")
			fmt.Printf("\nFull log: %s\n", logPath)
		}
		fmt.Println("\nPress Enter to exit...")
		fmt.Scanln()
	}
}

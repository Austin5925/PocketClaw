import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { ChatBubble } from "../components/ChatBubble";
import { MainLayout } from "../layouts/MainLayout";
import { useGateway } from "../hooks/useGateway";
import { Channels } from "./Channels";
import { Skills } from "./Skills";
import { History } from "./History";
import { MODEL_PROVIDERS } from "../utils/config";
import { useConfig } from "../hooks/useConfig";
import { showToast } from "../components/Toast";

const SUGGESTIONS = [
  "帮我写一封请假邮件",
  "用简单的话解释量子计算",
  "写一个 Python 冒泡排序",
  "帮我规划一次周末旅行",
];

export function Chat() {
  const { config, updateConfig } = useConfig();
  const {
    connected,
    connectionError,
    messages,
    sendMessage,
    regenerate,
    clearMessages,
    pending,
    currentSessionKey,
    switchSession,
    createSession,
    loadSessionHistory,
    sessionList,
  } = useGateway();
  const [input, setInput] = useState("");
  const [showModelSelect, setShowModelSelect] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = useCallback(() => {
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.style.height = "auto";
      const maxH = 200;
      el.style.height = `${Math.min(el.scrollHeight, maxH)}px`;
      el.style.overflowY = el.scrollHeight > maxH ? "auto" : "hidden";
    });
  }, []);
  const location = useLocation();
  const currentModel = config?.agent?.model ?? "minimax/MiniMax-M2.7";
  const activePage = location.pathname;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || pending) return;
    sendMessage(input);
    setInput("");
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Don't send during IME composition (Chinese input)
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleModelChange = async (model: string) => {
    setShowModelSelect(false);
    const provider = model.split("/")[0] ?? "";
    try {
      await updateConfig({ agent: { ...config?.agent, model }, [provider]: config?.[provider] });
      showToast(`已切换到 ${model.split("/").pop()}`, "success");
    } catch {
      showToast("切换模型失败", "error");
    }
  };

  return (
    <MainLayout
      currentSessionKey={currentSessionKey}
      onSessionChange={(key) => {
        switchSession(key);
        loadSessionHistory(key);
      }}
      onNewChat={() => createSession()}
      sessions={sessionList}
    >
      {activePage === "/channels" && <Channels />}
      {activePage === "/skills" && <Skills />}
      {activePage === "/history" && <History />}
      {(activePage === "/" || !["/channels", "/skills", "/history"].includes(activePage)) && (
        <>
          {/* Chat header */}
          <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2 dark:border-gray-700 dark:bg-gray-800">
            <p className={`text-xs ${connected ? "text-emerald-600" : "text-red-500"}`}>
              {connected ? "已连接" : connectionError || "连接中..."}
            </p>
            <button
              onClick={clearMessages}
              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700"
              title="清空当前对话"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                />
              </svg>
            </button>
          </header>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4">
            {messages.length === 0 && (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <p className="text-lg text-gray-400 dark:text-gray-500">开始和 AI 助手对话吧</p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        onClick={() => {
                          sendMessage(s);
                        }}
                        disabled={!connected || pending}
                        className="rounded-full border border-gray-200 px-3 py-1.5 text-xs text-gray-500 transition-colors hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-40 dark:border-gray-600 dark:text-gray-400 dark:hover:border-indigo-500 dark:hover:text-indigo-400"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div className="mx-auto max-w-3xl space-y-4">
              {messages.map((msg, idx) => (
                <ChatBubble
                  key={msg.id}
                  message={msg}
                  onRegenerate={
                    msg.role === "assistant" && idx === messages.length - 1 && !pending
                      ? regenerate
                      : undefined
                  }
                />
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Input area */}
          <div className="border-t border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
            <div className="mx-auto max-w-3xl">
              <div className="flex items-center gap-2 rounded-xl border-2 border-gray-200 bg-white px-3 py-2 focus-within:border-indigo-500 dark:border-gray-600 dark:bg-gray-700">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    autoResize();
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="输入消息..."
                  rows={1}
                  className="flex-1 resize-none bg-transparent text-sm leading-relaxed text-gray-900 outline-none placeholder:text-gray-400 dark:text-gray-100"
                  style={{ minHeight: "24px", maxHeight: "200px", overflowY: "hidden" }}
                />
                <div className="flex items-center gap-1">
                  {/* Model selector */}
                  <div className="relative">
                    <button
                      onClick={() => setShowModelSelect(!showModelSelect)}
                      className="rounded-lg px-2 py-1 text-[10px] text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-gray-600"
                      title="切换模型"
                    >
                      {currentModel.split("/").pop()}
                    </button>
                    {showModelSelect && (
                      <div className="absolute right-0 bottom-full mb-1 w-56 rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-600 dark:bg-gray-700">
                        {MODEL_PROVIDERS.map((p) =>
                          p.models.map((m) => (
                            <button
                              key={m}
                              onClick={() => void handleModelChange(m)}
                              className={`w-full px-3 py-1.5 text-left text-xs transition-colors hover:bg-gray-50 dark:hover:bg-gray-600 ${
                                m === currentModel
                                  ? "text-indigo-600 dark:text-indigo-400"
                                  : "text-gray-700 dark:text-gray-300"
                              }`}
                            >
                              <span className="font-medium">{m.split("/").pop()}</span>
                              <span className="ml-1 text-gray-400">({p.name})</span>
                            </button>
                          )),
                        )}
                      </div>
                    )}
                  </div>
                  {/* Send */}
                  <button
                    onClick={handleSend}
                    disabled={!input.trim() || pending || !connected}
                    className="rounded-lg bg-indigo-600 p-1.5 text-white transition-colors hover:bg-indigo-700 disabled:opacity-40"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </MainLayout>
  );
}

import { Link, useLocation } from "react-router-dom";

export interface SessionRow {
  key: string;
  displayName?: string;
  derivedTitle?: string;
  lastMessagePreview?: string;
  updatedAt?: number;
}

interface SidebarProps {
  open: boolean;
  onToggle: () => void;
  currentSessionKey: string;
  onSessionChange: (key: string) => void;
  onNewChat: () => void;
  sessions?: SessionRow[];
}

const NAV_ITEMS = [
  { path: "/", icon: "💬", label: "聊天" },
  { path: "/channels", icon: "📡", label: "Channels" },
  { path: "/skills", icon: "🧩", label: "Skills" },
  { path: "/history", icon: "📋", label: "历史记录" },
];

export function Sidebar({
  open,
  onToggle,
  currentSessionKey,
  onSessionChange,
  onNewChat,
  sessions = [],
}: SidebarProps) {
  const location = useLocation();

  if (!open) {
    return (
      <button
        onClick={onToggle}
        className="flex h-screen w-10 flex-col items-center border-r border-gray-200 bg-white pt-3 dark:border-gray-700 dark:bg-gray-800"
      >
        <span className="text-lg">🦞</span>
        <span className="mt-2 text-xs text-gray-400">☰</span>
      </button>
    );
  }

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">🦞</span>
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">PocketClaw</p>
            <p className="text-[10px] text-gray-400">简约模式</p>
          </div>
        </div>
        <button
          onClick={onToggle}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
      </div>

      {/* New Chat */}
      <div className="px-3 pb-2">
        <button
          onClick={onNewChat}
          className="flex w-full items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          新对话
        </button>
      </div>

      {/* Navigation */}
      <nav className="space-y-0.5 px-3">
        {NAV_ITEMS.map((item) => {
          const active = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
                  : "text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-700"
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
        <a
          href="http://localhost:18789"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-700"
        >
          <span className="text-base">⚙️</span>
          OpenClaw 高级模式
          <svg className="ml-auto h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
        </a>
      </nav>

      {/* Divider + Recent */}
      <div className="mx-3 mt-3 border-t border-gray-100 pt-2 dark:border-gray-700">
        <p className="px-3 pb-1 text-[10px] font-medium tracking-wider text-gray-400 uppercase">
          最近对话
        </p>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto px-3">
        {sessions.length === 0 && <p className="px-3 py-2 text-xs text-gray-400">暂无记录</p>}
        {sessions.map((s) => {
          const title = s.derivedTitle ?? s.displayName ?? s.key.split(":").pop() ?? "对话";
          const active = s.key === currentSessionKey;
          return (
            <button
              key={s.key}
              onClick={() => onSessionChange(s.key)}
              className={`mb-0.5 w-full truncate rounded-lg px-3 py-1.5 text-left text-xs transition-colors ${
                active
                  ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
                  : "text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-700"
              }`}
              title={s.lastMessagePreview ?? title}
            >
              {title}
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-100 px-3 py-2 dark:border-gray-700">
        <Link
          to="/settings"
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-500 transition-colors hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-700"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          设置
        </Link>
      </div>
    </aside>
  );
}

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage } from "../types";

interface ChatBubbleProps {
  message: ChatMessage;
  onRegenerate?: () => void;
}

export function ChatBubble({ message, onRegenerate }: ChatBubbleProps) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (!isUser && !isSystem && !message.pending && !message.content) {
    return null;
  }

  if (isSystem) {
    return (
      <div className="flex justify-center">
        <p className="max-w-md rounded-lg bg-amber-50 px-4 py-2 text-center text-sm text-amber-700">
          {message.content}
        </p>
      </div>
    );
  }

  return (
    <div className={`group flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className="flex flex-col">
        <div
          className={`max-w-3xl rounded-2xl px-4 py-3 ${
            isUser
              ? "bg-indigo-600 text-white"
              : "bg-white text-gray-900 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:text-gray-100 dark:ring-gray-700"
          }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
              {message.content}
            </p>
          ) : (
            <div className="prose prose-sm max-w-none break-words leading-relaxed prose-p:my-1 prose-pre:my-2 prose-pre:rounded-lg prose-pre:bg-gray-800 prose-pre:text-gray-100 prose-code:rounded prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:text-indigo-700 prose-code:before:content-none prose-code:after:content-none prose-headings:mt-3 prose-headings:mb-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0">
              {message.content ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
              ) : null}
            </div>
          )}
          {message.pending && !message.content && (
            <span className="mt-1 inline-block">
              <span className="inline-flex gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:300ms]" />
              </span>
            </span>
          )}
          {message.pending && message.content && (
            <span className="ml-1 inline-block h-3 w-0.5 animate-pulse bg-gray-400" />
          )}
        </div>
        {!message.pending && message.content && !isUser && (
          <div className="mt-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              onClick={() => void handleCopy()}
              className="rounded px-2 py-0.5 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              title="复制"
            >
              {copied ? "已复制" : "复制"}
            </button>
            {onRegenerate && (
              <button
                onClick={onRegenerate}
                className="rounded px-2 py-0.5 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                title="重新生成"
              >
                重新生成
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

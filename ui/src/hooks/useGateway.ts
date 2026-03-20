import { useState, useEffect, useCallback, useRef } from "react";
import type { ChatMessage } from "../types";
import type { WebSocketMessage } from "../utils/websocket";
import { useGatewayConnection } from "./GatewayContext";

export interface SessionListItem {
  key: string;
  displayName?: string;
  derivedTitle?: string;
  lastMessagePreview?: string;
  updatedAt?: number;
}

interface UseGatewayReturn {
  connected: boolean;
  connectionError: string;
  messages: ChatMessage[];
  sendMessage: (content: string) => void;
  regenerate: () => void;
  clearMessages: () => void;
  pending: boolean;
  currentSessionKey: string;
  switchSession: (key: string) => void;
  createSession: (label?: string) => void;
  loadSessionHistory: (key: string) => void;
  sessionList: SessionListItem[];
  refreshSessions: () => void;
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Strip OpenClaw envelope metadata prefixes from session titles / previews.
 *  OpenClaw wraps user messages with "Sender (untrusted metadata): ..." in transcripts,
 *  and deriveSessionTitle reads the first user message — which includes the envelope. */
function stripEnvelope(text: string | undefined): string | undefined {
  if (!text) return text;
  // Remove known envelope prefixes (case-insensitive, multiline)
  return (
    text
      .replace(/^Sender\s*\(untrusted metadata\)\s*:\s*/i, "")
      .replace(/^Conversation info\s*\(untrusted metadata\)\s*:\s*/i, "")
      .trim() || undefined
  );
}

/** Extract plain text from a gateway message object */
function extractText(msg: Record<string, unknown>): string {
  const content = msg.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return (content as Array<Record<string, unknown>>)
      .filter((c) => c.type === "text")
      .map((c) => (c.text as string) ?? "")
      .join("");
  }
  return "";
}

export function useGateway(): UseGatewayReturn {
  const { connected, connectionError, mainSessionKey, sendRpc, onMessage } = useGatewayConnection();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [currentSessionKey, setCurrentSessionKey] = useState(mainSessionKey);
  const [sessionList, setSessionList] = useState<SessionListItem[]>([]);

  // runId → local message ID (tracks all active AI streams)
  const runIdToMsgId = useRef<Map<string, string>>(new Map());
  const sessionKeyRef = useRef(mainSessionKey);
  const sendRpcRef = useRef(sendRpc);
  const sendTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    sendRpcRef.current = sendRpc;
  }, [sendRpc]);

  useEffect(() => {
    sessionKeyRef.current = currentSessionKey;
  }, [currentSessionKey]);

  // Sync session key from hello-ok snapshot when gateway connects
  useEffect(() => {
    if (mainSessionKey && mainSessionKey !== sessionKeyRef.current) {
      setCurrentSessionKey(mainSessionKey);
      sessionKeyRef.current = mainSessionKey;
    }
  }, [mainSessionKey]);

  // On (re)connect: clear stale pending state, reload sessions + history
  useEffect(() => {
    if (connected) {
      // Clear any in-flight state from before the disconnect
      runIdToMsgId.current.clear();
      if (sendTimeoutRef.current) {
        clearTimeout(sendTimeoutRef.current);
        sendTimeoutRef.current = null;
      }
      setPending(false);

      sendRpc("sessions.list", {
        limit: 20,
        includeDerivedTitles: true,
        includeLastMessage: true,
      });
      sendRpc("chat.history", {
        sessionKey: sessionKeyRef.current,
        limit: 200,
      });
    }
  }, [connected, sendRpc]);

  useEffect(() => {
    const unsub = onMessage((data: WebSocketMessage) => {
      // ── Chat events ──────────────────────────────────────────────────────────
      // Format (verified from OpenClaw control-ui source):
      //   { type:"event", event:"chat", payload:{ sessionKey, runId, state, message, errorMessage } }
      // - Delta text is CUMULATIVE (each event has the full text so far)
      // - We track by runId so we handle events from both simple and advanced mode
      if (data.type === "event" && data.event === "chat") {
        // OpenClaw sends chat event fields at the TOP LEVEL (verified from src/gateway/server-chat.ts).
        // Fall back to data.payload for forward-compat in case format ever changes.
        const p = (data.payload as Record<string, unknown> | undefined) ?? {};
        const state = (p.state ?? data.state) as string | undefined;
        const msg = (p.message ?? data.message) as Record<string, unknown> | undefined;
        const runId = (p.runId ?? data.runId) as string | undefined;
        const errorMessage = (p.errorMessage ?? data.errorMessage) as string | undefined;

        if (!state) return;

        if (state === "error" || state === "aborted") {
          if (runId && runIdToMsgId.current.has(runId)) {
            // Known run — update existing assistant bubble to show error
            const msgId = runIdToMsgId.current.get(runId)!;
            const errorText = errorMessage ?? "请求失败";
            setMessages((prev) =>
              prev.map((m) =>
                m.id === msgId ? { ...m, content: errorText, pending: false, role: "system" } : m,
              ),
            );
            runIdToMsgId.current.delete(runId);
            if (runIdToMsgId.current.size === 0) setPending(false);
          } else if (sendTimeoutRef.current !== null) {
            // Error arrived before first delta (unknown runId) — show as system message
            clearTimeout(sendTimeoutRef.current);
            sendTimeoutRef.current = null;
            const errorText = errorMessage ?? "请求失败";
            setMessages((prev) => [
              ...prev,
              {
                id: makeId(),
                role: "system",
                content: errorText,
                timestamp: Date.now(),
                pending: false,
              },
            ]);
            setPending(false);
          }
          return;
        }

        if (state === "delta" && msg) {
          const text = extractText(msg);
          if (!runId) return;

          if (!runIdToMsgId.current.has(runId)) {
            // New run — create assistant bubble
            // Clear send timeout: we got a response
            if (sendTimeoutRef.current) {
              clearTimeout(sendTimeoutRef.current);
              sendTimeoutRef.current = null;
            }
            const newId = makeId();
            runIdToMsgId.current.set(runId, newId);
            setPending(true);
            setMessages((prev) => [
              ...prev,
              {
                id: newId,
                role: "assistant",
                content: text,
                timestamp: Date.now(),
                pending: true,
              },
            ]);
          } else if (text) {
            // Update existing bubble (cumulative — replace, not append)
            const msgId = runIdToMsgId.current.get(runId)!;
            setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, content: text } : m)));
          }
          return;
        }

        if (state === "final") {
          if (runId && runIdToMsgId.current.has(runId)) {
            // Normal: delta(s) arrived before final — update existing bubble
            const msgId = runIdToMsgId.current.get(runId)!;
            const text = msg ? extractText(msg) : "";
            setMessages((prev) =>
              prev.map((m) =>
                m.id === msgId ? { ...m, ...(text ? { content: text } : {}), pending: false } : m,
              ),
            );
            runIdToMsgId.current.delete(runId);
            if (runIdToMsgId.current.size === 0) setPending(false);
            sendRpcRef.current("sessions.list", {
              limit: 20,
              includeDerivedTitles: true,
              includeLastMessage: true,
            });
          } else if (runId && sendTimeoutRef.current !== null) {
            // Final arrived before any delta (throttled deltas, silent reply, or no-agent path).
            // The final event contains the full message text — use it directly.
            clearTimeout(sendTimeoutRef.current);
            sendTimeoutRef.current = null;
            const text = msg ? extractText(msg) : "";
            if (text) {
              const newId = makeId();
              setMessages((prev) => [
                ...prev,
                {
                  id: newId,
                  role: "assistant",
                  content: text,
                  timestamp: Date.now(),
                  pending: false,
                },
              ]);
            } else {
              setMessages((prev) => [
                ...prev,
                {
                  id: makeId(),
                  role: "system",
                  content: "AI 未返回内容",
                  timestamp: Date.now(),
                  pending: false,
                },
              ]);
            }
            setPending(false);
          }
          return;
        }

        return;
      }

      // ── RPC responses ────────────────────────────────────────────────────────
      if (data.type === "res" && (data as Record<string, unknown>).ok) {
        const payload = data.payload as Record<string, unknown> | undefined;

        // sessions.list response
        if (payload?.sessions && Array.isArray(payload.sessions) && payload.count !== undefined) {
          setSessionList(
            (payload.sessions as Array<Record<string, unknown>>).map((s) => ({
              key: s.key as string,
              displayName: s.displayName as string | undefined,
              derivedTitle: stripEnvelope(s.derivedTitle as string | undefined),
              lastMessagePreview: stripEnvelope(s.lastMessagePreview as string | undefined),
              updatedAt: s.updatedAt as number | undefined,
            })),
          );
          return;
        }

        // sessions.create response
        if (payload?.key && typeof payload.key === "string" && payload.sessionId) {
          const newKey = payload.key as string;
          setCurrentSessionKey(newKey);
          sessionKeyRef.current = newKey;
          setMessages([]);
          setPending(false);
          runIdToMsgId.current.clear();
          sendRpcRef.current("sessions.list", {
            limit: 20,
            includeDerivedTitles: true,
            includeLastMessage: true,
          });
          return;
        }

        // chat.history response — replace messages with loaded history
        if (payload?.messages && Array.isArray(payload.messages)) {
          const history = (payload.messages as Array<Record<string, unknown>>)
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => {
              const text = extractText(m);
              return {
                id: makeId(),
                role: m.role as "user" | "assistant",
                // Strip envelope metadata that OpenClaw wraps around user messages
                content: m.role === "user" ? (stripEnvelope(text) ?? text) : text,
                timestamp: (m.timestamp as number) ?? Date.now(),
              };
            });
          setMessages(history);
          return;
        }
      }

      // ── RPC errors ───────────────────────────────────────────────────────────
      if (data.type === "res" && !(data as Record<string, unknown>).ok) {
        // Show error if a send is in flight (timeout running) OR if we have active runs
        const sendInFlight = sendTimeoutRef.current !== null;
        if (sendInFlight || runIdToMsgId.current.size > 0) {
          const errPayload = (data as Record<string, unknown>).error as
            | Record<string, unknown>
            | undefined;
          const errMsg =
            (errPayload?.message as string) ??
            ((data.payload as Record<string, unknown> | undefined)?.message as string) ??
            "请求失败";
          if (sendTimeoutRef.current) {
            clearTimeout(sendTimeoutRef.current);
            sendTimeoutRef.current = null;
          }
          if (runIdToMsgId.current.size > 0) {
            // Mark all pending bubbles as error
            runIdToMsgId.current.forEach((msgId) => {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === msgId ? { ...m, content: errMsg, pending: false, role: "system" } : m,
                ),
              );
            });
            runIdToMsgId.current.clear();
          } else {
            // chat.send itself failed before any delta — add system error message
            setMessages((prev) => [
              ...prev,
              {
                id: makeId(),
                role: "system",
                content: errMsg,
                timestamp: Date.now(),
                pending: false,
              },
            ]);
          }
          setPending(false);
        }
      }
    });

    return unsub;
  }, [onMessage]);

  const sendMessage = useCallback((content: string) => {
    if (!content.trim()) return;
    // Create user message locally for immediate feedback
    setMessages((prev) => [
      ...prev,
      { id: makeId(), role: "user", content: content.trim(), timestamp: Date.now() },
    ]);
    setPending(true);
    // Clear any existing send timeout before starting a new one
    if (sendTimeoutRef.current) {
      clearTimeout(sendTimeoutRef.current);
    }
    // 60s timeout: if no delta arrives, clear pending and show error
    sendTimeoutRef.current = setTimeout(() => {
      sendTimeoutRef.current = null;
      if (runIdToMsgId.current.size === 0) {
        // No response started — add a timeout error message
        setMessages((prev) => [
          ...prev,
          {
            id: makeId(),
            role: "system",
            content: "请求超时，请重试",
            timestamp: Date.now(),
            pending: false,
          },
        ]);
        setPending(false);
      }
    }, 60000);
    // Assistant bubble is created when first delta event arrives (gateway-driven)
    sendRpcRef.current("chat.send", {
      sessionKey: sessionKeyRef.current,
      message: content.trim(),
      deliver: false,
      idempotencyKey: crypto.randomUUID(),
    });
  }, []);

  const regenerate = useCallback(() => {
    if (pending) return;
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user")?.content;
    if (!lastUserMsg) return;
    // Remove last assistant message
    setMessages((prev) => {
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i]?.role === "assistant") return prev.filter((_, idx) => idx !== i);
      }
      return prev;
    });
    setPending(true);
    if (sendTimeoutRef.current) clearTimeout(sendTimeoutRef.current);
    sendTimeoutRef.current = setTimeout(() => {
      sendTimeoutRef.current = null;
      if (runIdToMsgId.current.size === 0) {
        setMessages((prev) => [
          ...prev,
          {
            id: makeId(),
            role: "system",
            content: "请求超时，请重试",
            timestamp: Date.now(),
            pending: false,
          },
        ]);
        setPending(false);
      }
    }, 60000);
    sendRpcRef.current("chat.send", {
      sessionKey: sessionKeyRef.current,
      message: lastUserMsg,
      deliver: false,
      idempotencyKey: crypto.randomUUID(),
    });
  }, [messages, pending]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setPending(false);
    runIdToMsgId.current.clear();
    sendRpcRef.current("sessions.reset", {
      key: sessionKeyRef.current,
      reason: "new",
    });
  }, []);

  const switchSession = useCallback((key: string) => {
    setCurrentSessionKey(key);
    sessionKeyRef.current = key;
    setMessages([]);
    setPending(false);
    runIdToMsgId.current.clear();
  }, []);

  const createSession = useCallback((label?: string) => {
    sendRpcRef.current("sessions.create", {
      label: label ?? undefined,
      agentId: "main",
    });
  }, []);

  const loadSessionHistory = useCallback((key: string) => {
    sendRpcRef.current("chat.history", {
      sessionKey: key,
      limit: 200,
    });
  }, []);

  const refreshSessions = useCallback(() => {
    sendRpcRef.current("sessions.list", {
      limit: 20,
      includeDerivedTitles: true,
      includeLastMessage: true,
    });
  }, []);

  return {
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
    refreshSessions,
  };
}

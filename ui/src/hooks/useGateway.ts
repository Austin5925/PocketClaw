import { useState, useEffect, useCallback, useRef } from "react";
import type { ChatMessage } from "../types";
import { GatewayWebSocket, type WebSocketMessage } from "../utils/websocket";

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

function uuid(): string {
  return crypto.randomUUID();
}

const DEFAULT_SESSION = "agent:main:main";

export function useGateway(): UseGatewayReturn {
  const [connected, setConnected] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [currentSessionKey, setCurrentSessionKey] = useState(DEFAULT_SESSION);
  const [sessionList, setSessionList] = useState<SessionListItem[]>([]);
  const wsRef = useRef<GatewayWebSocket | null>(null);
  const pendingIdRef = useRef<string | null>(null);
  const sessionKeyRef = useRef(DEFAULT_SESSION);

  useEffect(() => {
    sessionKeyRef.current = currentSessionKey;
  }, [currentSessionKey]);

  useEffect(() => {
    const ws = new GatewayWebSocket();
    wsRef.current = ws;

    const unsubStatus = ws.onStatus((isConnected, error) => {
      setConnected(isConnected);
      if (isConnected) {
        setConnectionError("");
        // Load session list after connection established
        ws.sendRpc("sessions.list", {
          limit: 20,
          includeDerivedTitles: true,
          includeLastMessage: true,
        });
      } else if (error) {
        setConnectionError(error);
      }
    });

    const unsubMessage = ws.onMessage((data: WebSocketMessage) => {
      // Handle OpenClaw chat events (agent responses)
      // Fields (state, message, runId) are TOP-LEVEL, not inside payload
      // (verified from OpenClaw source: src/gateway/server-chat.ts)
      if (data.type === "event" && data.event === "chat") {
        const d = data as Record<string, unknown>;
        const state = d.state as string | undefined;
        const msg = d.message as Record<string, unknown> | undefined;

        // Handle error state (has errorMessage, no message field)
        if ((state === "error" || state === "aborted") && pendingIdRef.current) {
          const errorText = (d.errorMessage as string) ?? "请求失败";
          setMessages((prev) =>
            prev.map((m) =>
              m.id === pendingIdRef.current
                ? { ...m, content: errorText, pending: false, role: "system" }
                : m,
            ),
          );
          pendingIdRef.current = null;
          setPending(false);
          return;
        }

        // Handle delta: extract text and update message content
        if (msg && pendingIdRef.current) {
          const contentArr = msg.content as Array<Record<string, unknown>> | undefined;
          let text = "";
          if (Array.isArray(contentArr)) {
            text = contentArr
              .filter((c) => c.type === "text")
              .map((c) => (c.text as string) ?? "")
              .join("");
          } else if (typeof msg.content === "string") {
            text = msg.content;
          }

          if (text) {
            setMessages((prev) =>
              prev.map((m) => (m.id === pendingIdRef.current ? { ...m, content: text } : m)),
            );
          }
        }

        // Handle final: mark message as done
        if (state === "final" && pendingIdRef.current) {
          setMessages((prev) =>
            prev.map((m) => (m.id === pendingIdRef.current ? { ...m, pending: false } : m)),
          );
          pendingIdRef.current = null;
          setPending(false);
        }
        return;
      }

      // Handle RPC responses (sessions.create, sessions.get, sessions.list, etc.)
      if (data.type === "res" && (data as Record<string, unknown>).ok) {
        const payload = data.payload as Record<string, unknown> | undefined;

        // sessions.list response
        if (payload?.sessions && Array.isArray(payload.sessions) && payload.count !== undefined) {
          setSessionList(
            (payload.sessions as Array<Record<string, unknown>>).map((s) => ({
              key: s.key as string,
              displayName: s.displayName as string | undefined,
              derivedTitle: s.derivedTitle as string | undefined,
              lastMessagePreview: s.lastMessagePreview as string | undefined,
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
          pendingIdRef.current = null;
          // Refresh session list
          ws.sendRpc("sessions.list", {
            limit: 20,
            includeDerivedTitles: true,
            includeLastMessage: true,
          });
          return;
        }

        // sessions.get / chat.history response
        if (payload?.messages && Array.isArray(payload.messages)) {
          const history = (payload.messages as Array<Record<string, unknown>>)
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => {
              let text = "";
              if (typeof m.content === "string") {
                text = m.content;
              } else if (Array.isArray(m.content)) {
                text = (m.content as Array<Record<string, unknown>>)
                  .filter((c) => c.type === "text")
                  .map((c) => (c.text as string) ?? "")
                  .join("");
              }
              return {
                id: makeId(),
                role: m.role as "user" | "assistant",
                content: text,
                timestamp: (m.timestamp as number) ?? Date.now(),
              } satisfies ChatMessage;
            });
          setMessages(history);
        }
        return;
      }

      // Handle RPC error responses
      if (data.type === "res" && !(data as Record<string, unknown>).ok) {
        if (pendingIdRef.current) {
          const errPayload = (data as Record<string, unknown>).error as
            | Record<string, unknown>
            | undefined;
          const errMsg =
            (errPayload?.message as string) ??
            ((data.payload as Record<string, unknown> | undefined)?.message as string) ??
            "请求失败";
          setMessages((prev) =>
            prev.map((m) =>
              m.id === pendingIdRef.current
                ? { ...m, content: errMsg, pending: false, role: "system" }
                : m,
            ),
          );
          pendingIdRef.current = null;
          setPending(false);
        }
      }
    });

    ws.connect();

    return () => {
      unsubStatus();
      unsubMessage();
      ws.disconnect();
    };
  }, []);

  const sendMessage = useCallback((content: string) => {
    if (!content.trim() || !wsRef.current) return;

    const userMsg: ChatMessage = {
      id: makeId(),
      role: "user",
      content: content.trim(),
      timestamp: Date.now(),
    };

    const assistantId = makeId();
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      pending: true,
    };

    pendingIdRef.current = assistantId;
    setPending(true);
    setMessages((prev) => [...prev, userMsg, assistantMsg]);

    wsRef.current.sendRpc("chat.send", {
      sessionKey: sessionKeyRef.current,
      message: content.trim(),
      deliver: false,
      idempotencyKey: uuid(),
    });
  }, []);

  const regenerate = useCallback(() => {
    if (pending || !wsRef.current) return;
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUserMsg) return;

    setMessages((prev) => {
      let lastIdx = -1;
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i]?.role === "assistant") {
          lastIdx = i;
          break;
        }
      }
      if (lastIdx >= 0) {
        return prev.filter((_, i) => i !== lastIdx);
      }
      return prev;
    });

    const assistantId = makeId();
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      pending: true,
    };

    pendingIdRef.current = assistantId;
    setPending(true);
    setMessages((prev) => [...prev, assistantMsg]);

    wsRef.current.sendRpc("chat.send", {
      sessionKey: sessionKeyRef.current,
      message: lastUserMsg.content,
      deliver: false,
      idempotencyKey: uuid(),
    });
  }, [messages, pending]);

  const clearMessages = useCallback(() => {
    if (!wsRef.current) return;
    setMessages([]);
    setPending(false);
    pendingIdRef.current = null;
    // Reset session on the server
    wsRef.current.sendRpc("sessions.reset", {
      key: sessionKeyRef.current,
      reason: "new",
    });
  }, []);

  const switchSession = useCallback((key: string) => {
    setCurrentSessionKey(key);
    sessionKeyRef.current = key;
    setMessages([]);
    setPending(false);
    pendingIdRef.current = null;
  }, []);

  const createSession = useCallback((label?: string) => {
    if (!wsRef.current) return;
    wsRef.current.sendRpc("sessions.create", {
      label: label ?? undefined,
      agentId: "main",
    });
  }, []);

  const loadSessionHistory = useCallback((key: string) => {
    if (!wsRef.current) return;
    wsRef.current.sendRpc("chat.history", {
      sessionKey: key,
      limit: 200,
    });
  }, []);

  const refreshSessions = useCallback(() => {
    if (!wsRef.current) return;
    wsRef.current.sendRpc("sessions.list", {
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

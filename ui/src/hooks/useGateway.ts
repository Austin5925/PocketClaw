import { useState, useEffect, useCallback, useRef } from "react";
import type { ChatMessage } from "../types";
import { GatewayWebSocket, type WebSocketMessage } from "../utils/websocket";

interface UseGatewayReturn {
  connected: boolean;
  connectionError: string;
  messages: ChatMessage[];
  sendMessage: (content: string) => void;
  clearMessages: () => void;
  pending: boolean;
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function useGateway(): UseGatewayReturn {
  const [connected, setConnected] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const wsRef = useRef<GatewayWebSocket | null>(null);
  const pendingIdRef = useRef<string | null>(null);

  useEffect(() => {
    const ws = new GatewayWebSocket();
    wsRef.current = ws;

    const unsubStatus = ws.onStatus((isConnected, error) => {
      setConnected(isConnected);
      if (isConnected) {
        setConnectionError("");
      } else if (error) {
        setConnectionError(error);
      }
    });

    const unsubMessage = ws.onMessage((data: WebSocketMessage) => {
      // Handle OpenClaw event messages (chat responses)
      if (data.type === "event" && data.event === "agent") {
        const payload = data.payload as Record<string, unknown> | undefined;
        const text = (payload?.text as string) ?? (payload?.content as string) ?? "";
        const done = payload?.done === true || payload?.final === true;

        if (text && pendingIdRef.current) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === pendingIdRef.current ? { ...m, content: m.content + text } : m,
            ),
          );
        }

        if (done && pendingIdRef.current) {
          setMessages((prev) =>
            prev.map((m) => (m.id === pendingIdRef.current ? { ...m, pending: false } : m)),
          );
          pendingIdRef.current = null;
          setPending(false);
        }
        return;
      }

      // Handle OpenClaw RPC responses
      if (data.type === "res") {
        const ok = (data as Record<string, unknown>).ok as boolean;
        if (!ok && pendingIdRef.current) {
          const payload = data.payload as Record<string, unknown> | undefined;
          const errMsg = (payload?.message as string) ?? "请求失败";
          setMessages((prev) => [
            ...prev,
            {
              id: makeId(),
              role: "system",
              content: `Error: ${errMsg}`,
              timestamp: Date.now(),
            },
          ]);
          setMessages((prev) =>
            prev.map((m) => (m.id === pendingIdRef.current ? { ...m, pending: false } : m)),
          );
          pendingIdRef.current = null;
          setPending(false);
        }
        return;
      }

      // Legacy format fallback
      if (data.type === "text" || data.type === "message") {
        const content = typeof data.content === "string" ? data.content : "";
        if (pendingIdRef.current) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === pendingIdRef.current ? { ...m, content: m.content + content } : m,
            ),
          );
        }
      }

      if (data.type === "end" || data.type === "done" || data.type === "error") {
        if (pendingIdRef.current) {
          setMessages((prev) =>
            prev.map((m) => (m.id === pendingIdRef.current ? { ...m, pending: false } : m)),
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

    // Send via OpenClaw RPC protocol
    wsRef.current.sendRpc("agent", {
      message: content.trim(),
    });
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setPending(false);
    pendingIdRef.current = null;
  }, []);

  return { connected, connectionError, messages, sendMessage, clearMessages, pending };
}

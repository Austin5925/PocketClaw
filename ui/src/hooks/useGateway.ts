import { useState, useEffect, useCallback, useRef } from "react";
import type { ChatMessage } from "../types";
import { GatewayWebSocket, type WebSocketMessage } from "../utils/websocket";

interface UseGatewayReturn {
  connected: boolean;
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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const wsRef = useRef<GatewayWebSocket | null>(null);
  const pendingIdRef = useRef<string | null>(null);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const ws = new GatewayWebSocket(wsUrl);
    wsRef.current = ws;

    const unsubStatus = ws.onStatus((isConnected) => {
      setConnected(isConnected);
    });

    const unsubMessage = ws.onMessage((data: WebSocketMessage) => {
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

        if (data.type === "error" && typeof data.content === "string") {
          setMessages((prev) => [
            ...prev,
            {
              id: makeId(),
              role: "system",
              content: `Error: ${data.content}`,
              timestamp: Date.now(),
            },
          ]);
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

    wsRef.current.send({
      type: "message",
      content: content.trim(),
      session: "main",
    });
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setPending(false);
    pendingIdRef.current = null;
  }, []);

  return { connected, messages, sendMessage, clearMessages, pending };
}

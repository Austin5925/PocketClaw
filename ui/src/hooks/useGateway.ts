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

function uuid(): string {
  return crypto.randomUUID();
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
      // Handle OpenClaw chat events (agent responses)
      if (data.type === "event" && data.event === "chat") {
        const payload = data.payload as Record<string, unknown> | undefined;
        if (!payload) return;

        const state = payload.state as string;
        const msg = payload.message as Record<string, unknown> | undefined;

        if (msg && pendingIdRef.current) {
          // Extract text from content array: [{type:"text", text:"..."}]
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

        if (state === "final" && pendingIdRef.current) {
          setMessages((prev) =>
            prev.map((m) => (m.id === pendingIdRef.current ? { ...m, pending: false } : m)),
          );
          pendingIdRef.current = null;
          setPending(false);
        }

        // Handle agent errors
        if (state === "final" && msg) {
          const content = msg.content as Array<Record<string, unknown>> | undefined;
          if (Array.isArray(content)) {
            const errorItem = content.find(
              (c) => c.type === "text" && typeof c.text === "string" && c.text.includes("failed"),
            );
            if (errorItem && pendingIdRef.current) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === pendingIdRef.current
                    ? { ...m, content: String(errorItem.text), pending: false, role: "system" }
                    : m,
                ),
              );
              pendingIdRef.current = null;
              setPending(false);
            }
          }
        }
        return;
      }

      // Handle RPC error responses
      if (data.type === "res" && !(data as Record<string, unknown>).ok) {
        if (pendingIdRef.current) {
          const payload = data.payload as Record<string, unknown> | undefined;
          const errMsg = (payload?.message as string) ?? "请求失败";
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

    // Send via OpenClaw chat.send RPC (verified from DevTools)
    wsRef.current.sendRpc("chat.send", {
      sessionKey: "agent:main:main",
      message: content.trim(),
      deliver: false,
      idempotencyKey: uuid(),
    });
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setPending(false);
    pendingIdRef.current = null;
  }, []);

  return { connected, connectionError, messages, sendMessage, clearMessages, pending };
}

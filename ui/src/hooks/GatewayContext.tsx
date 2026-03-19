import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { GatewayWebSocket, type WebSocketMessage } from "../utils/websocket";

interface GatewayContextValue {
  connected: boolean;
  connectionError: string;
  sendRpc: (method: string, params: Record<string, unknown>) => void;
  onMessage: (handler: (data: WebSocketMessage) => void) => () => void;
}

const GatewayCtx = createContext<GatewayContextValue>({
  connected: false,
  connectionError: "",
  sendRpc: () => {},
  onMessage: () => () => {},
});

export function GatewayProvider({ children }: { children: React.ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const wsRef = useRef<GatewayWebSocket | null>(null);

  useEffect(() => {
    const ws = new GatewayWebSocket();
    wsRef.current = ws;

    ws.onStatus((isConnected, error) => {
      setConnected(isConnected);
      if (isConnected) {
        setConnectionError("");
      } else if (error) {
        setConnectionError(error);
      }
    });

    ws.connect();

    return () => {
      ws.disconnect();
      wsRef.current = null;
    };
  }, []);

  const sendRpc = useCallback((method: string, params: Record<string, unknown>) => {
    wsRef.current?.sendRpc(method, params);
  }, []);

  const onMessage = useCallback((handler: (data: WebSocketMessage) => void) => {
    if (!wsRef.current) return () => {};
    return wsRef.current.onMessage(handler);
  }, []);

  return (
    <GatewayCtx.Provider value={{ connected, connectionError, sendRpc, onMessage }}>
      {children}
    </GatewayCtx.Provider>
  );
}

export function useGatewayConnection() {
  return useContext(GatewayCtx);
}

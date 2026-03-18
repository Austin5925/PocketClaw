type MessageHandler = (data: WebSocketMessage) => void;
type StatusHandler = (connected: boolean, error?: string) => void;

export interface WebSocketMessage {
  type: string;
  content?: string;
  event?: string;
  method?: string;
  payload?: Record<string, unknown>;
  [key: string]: unknown;
}

const GATEWAY_WS_URL = "ws://localhost:18789/";
const GATEWAY_TOKEN = "pocketclaw-local";

export class GatewayWebSocket {
  private ws: WebSocket | null = null;
  private messageHandlers: Set<MessageHandler> = new Set();
  private statusHandlers: Set<StatusHandler> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private intentionallyClosed = false;
  private handshakeComplete = false;

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    this.intentionallyClosed = false;
    this.handshakeComplete = false;

    try {
      this.ws = new WebSocket(GATEWAY_WS_URL);

      this.ws.onopen = () => {
        // Don't notify connected yet — wait for hello-ok after challenge-response
      };

      this.ws.onmessage = (event) => {
        let data: WebSocketMessage;
        try {
          data = JSON.parse(String(event.data)) as WebSocketMessage;
        } catch {
          return;
        }

        // Step 1: Receive challenge, send connect frame
        if (data.type === "event" && data.event === "connect.challenge") {
          const nonce = (data.payload as Record<string, unknown>)?.nonce as string;
          this.sendConnectFrame(nonce);
          return;
        }

        // Step 2: Receive hello-ok, connection established
        if (data.type === "res" && (data.payload as Record<string, unknown>)?.type === "hello-ok") {
          this.handshakeComplete = true;
          this.reconnectAttempts = 0;
          this.notifyStatus(true);
          return;
        }

        // Step 3: Handle auth errors
        if (data.type === "res" && !(data as Record<string, unknown>).ok) {
          this.notifyStatus(false, "Gateway 认证失败");
          return;
        }

        // Forward other messages to handlers
        if (this.handshakeComplete) {
          this.messageHandlers.forEach((handler) => handler(data));
        }
      };

      this.ws.onclose = () => {
        if (this.handshakeComplete) {
          this.notifyStatus(false, "连接已断开");
        } else {
          this.notifyStatus(false, "Gateway 连接失败");
        }
        this.handshakeComplete = false;

        if (!this.intentionallyClosed) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = () => {
        // onclose fires after this
      };
    } catch {
      this.notifyStatus(false, "无法连接到 Gateway");
    }
  }

  private sendConnectFrame(nonce: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const frame = {
      type: "req",
      id: crypto.randomUUID(),
      method: "connect",
      params: {
        minProtocol: 3,
        maxProtocol: 3,
        auth: { token: GATEWAY_TOKEN },
        client: {
          id: "gateway-client",
          version: "1.0",
          mode: "backend",
          platform: navigator.platform,
        },
        device: { id: "pocketclaw-device", nonce },
        locale: "zh-CN",
      },
    };

    this.ws.send(JSON.stringify(frame));
  }

  disconnect(): void {
    this.intentionallyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  send(message: WebSocketMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN && this.handshakeComplete) {
      this.ws.send(JSON.stringify(message));
    }
  }

  sendRpc(method: string, params: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN && this.handshakeComplete) {
      this.ws.send(
        JSON.stringify({
          type: "req",
          id: crypto.randomUUID(),
          method,
          params,
        }),
      );
    }
  }

  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onStatus(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN && this.handshakeComplete;
  }

  private notifyStatus(connected: boolean, error?: string): void {
    this.statusHandlers.forEach((handler) => handler(connected, error));
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.notifyStatus(false, "无法连接到 AI 引擎，请重新启动");
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }
}

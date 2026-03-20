import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { useGateway } from "../useGateway";
import { GatewayProvider } from "../GatewayContext";
import type { ReactNode } from "react";

let wsInstances: MockWebSocket[] = [];

class MockWebSocket {
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];

  constructor(_url: string) {
    wsInstances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = 3;
    this.onclose?.({ code: 1000, reason: "" });
  }

  simulateOpen() {
    this.readyState = 1;
    this.onopen?.();
  }

  simulateMessage(data: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  simulateHandshake() {
    this.simulateOpen();
    this.simulateMessage({
      type: "event",
      event: "connect.challenge",
      payload: { nonce: "test-nonce-123", ts: Date.now() },
    });
    this.simulateMessage({
      type: "res",
      id: "test-id",
      ok: true,
      payload: { type: "hello-ok", protocol: 3 },
    });
  }
}

Object.defineProperty(MockWebSocket.prototype, "OPEN", { value: 1 });

function Wrapper({ children }: { children: ReactNode }) {
  return <GatewayProvider>{children}</GatewayProvider>;
}

beforeAll(() => {
  vi.useFakeTimers();
});

afterAll(() => {
  vi.useRealTimers();
});

// Minimal crypto.subtle mock for Ed25519 device identity in test environment
const mockCryptoSubtle = {
  generateKey: vi.fn().mockResolvedValue({
    privateKey: { type: "private" },
    publicKey: { type: "public" },
  }),
  exportKey: vi.fn().mockImplementation((format: string) => {
    if (format === "raw") return Promise.resolve(new Uint8Array(32));
    return Promise.resolve({ crv: "Ed25519", x: "test-pub-key" });
  }),
  importKey: vi.fn().mockResolvedValue({ type: "key" }),
  sign: vi.fn().mockResolvedValue(new Uint8Array(64)),
  digest: vi.fn().mockResolvedValue(new Uint8Array(32)),
};

beforeEach(() => {
  wsInstances = [];
  localStorage.clear();
  vi.stubGlobal("WebSocket", MockWebSocket);
  vi.stubGlobal("crypto", {
    randomUUID: () => "test-uuid",
    subtle: mockCryptoSubtle,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllTimers();
});

function getLatestWs(): MockWebSocket {
  const ws = wsInstances[wsInstances.length - 1];
  if (!ws) throw new Error("No WebSocket instance");
  return ws;
}

describe("useGateway", () => {
  it("starts disconnected then connects after handshake", async () => {
    const { result } = renderHook(() => useGateway(), { wrapper: Wrapper });

    expect(result.current.connected).toBe(false);

    const ws = getLatestWs();
    act(() => {
      ws.simulateHandshake();
    });

    expect(result.current.connected).toBe(true);
  });

  it("sends a message and creates user bubble immediately, marks pending", () => {
    const { result } = renderHook(() => useGateway(), { wrapper: Wrapper });

    const ws = getLatestWs();
    act(() => {
      ws.simulateHandshake();
    });

    act(() => {
      result.current.sendMessage("Hello");
    });

    // Gateway-driven: only user message is created locally; assistant bubble
    // appears when the first delta event arrives from the gateway.
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]?.role).toBe("user");
    expect(result.current.messages[0]?.content).toBe("Hello");
    expect(result.current.pending).toBe(true);
  });

  it("creates assistant bubble on delta event and resolves on final", () => {
    const { result } = renderHook(() => useGateway(), { wrapper: Wrapper });

    const ws = getLatestWs();
    act(() => {
      ws.simulateHandshake();
    });

    act(() => {
      result.current.sendMessage("Hello");
    });

    // Simulate delta event from gateway
    act(() => {
      ws.simulateMessage({
        type: "event",
        event: "chat",
        payload: {
          runId: "run-abc",
          state: "delta",
          message: { role: "assistant", content: [{ type: "text", text: "Hi there" }] },
        },
      });
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1]?.role).toBe("assistant");
    expect(result.current.messages[1]?.content).toBe("Hi there");
    expect(result.current.messages[1]?.pending).toBe(true);

    // Simulate final event
    act(() => {
      ws.simulateMessage({
        type: "event",
        event: "chat",
        payload: {
          runId: "run-abc",
          state: "final",
          message: { role: "assistant", content: [{ type: "text", text: "Hi there!" }] },
        },
      });
    });

    expect(result.current.messages[1]?.content).toBe("Hi there!");
    expect(result.current.messages[1]?.pending).toBe(false);
    expect(result.current.pending).toBe(false);
  });

  it("clears messages", () => {
    const { result } = renderHook(() => useGateway(), { wrapper: Wrapper });

    const ws = getLatestWs();
    act(() => {
      ws.simulateHandshake();
    });

    act(() => {
      result.current.sendMessage("Hello");
    });

    expect(result.current.messages).toHaveLength(1);

    act(() => {
      result.current.clearMessages();
    });

    expect(result.current.messages).toEqual([]);
    expect(result.current.pending).toBe(false);
  });

  it("shows timeout error after 60s with no delta response", () => {
    const { result } = renderHook(() => useGateway(), { wrapper: Wrapper });

    const ws = getLatestWs();
    act(() => {
      ws.simulateHandshake();
    });

    act(() => {
      result.current.sendMessage("Hello");
    });

    expect(result.current.pending).toBe(true);
    expect(result.current.messages).toHaveLength(1);

    // Advance timers by 60s without any delta arriving
    act(() => {
      vi.advanceTimersByTime(60000);
    });

    // Timeout should have fired — pending cleared, error message added
    expect(result.current.pending).toBe(false);
    const lastMsg = result.current.messages[result.current.messages.length - 1];
    expect(lastMsg?.role).toBe("system");
    expect(lastMsg?.content).toBe("请求超时，请重试");
  });

  it("ignores empty messages", () => {
    const { result } = renderHook(() => useGateway(), { wrapper: Wrapper });

    const ws = getLatestWs();
    act(() => {
      ws.simulateHandshake();
    });

    act(() => {
      result.current.sendMessage("   ");
    });

    expect(result.current.messages).toEqual([]);
  });
});

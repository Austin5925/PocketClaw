import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useGateway } from "../useGateway";

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

  /** Simulate the OpenClaw challenge-response handshake */
  simulateHandshake() {
    this.simulateOpen();
    // Gateway sends challenge
    this.simulateMessage({
      type: "event",
      event: "connect.challenge",
      payload: { nonce: "test-nonce-123", ts: Date.now() },
    });
    // hello-ok is sent after a microtask delay (async Ed25519 signing)
    // so the caller must await before checking results
  }

  /** Send hello-ok after the async connect frame resolves */
  sendHelloOk() {
    this.simulateMessage({
      type: "res",
      id: "test-id",
      ok: true,
      payload: { type: "hello-ok", protocol: 3 },
    });
  }
}

Object.defineProperty(MockWebSocket.prototype, "OPEN", { value: 1 });

// Mock Ed25519 device identity so tests don't need real Web Crypto Ed25519
vi.mock("../../utils/deviceIdentity", () => ({
  signChallenge: vi.fn().mockResolvedValue({
    deviceId: "mock-device-id",
    publicKey: "mock-public-key",
    signature: "mock-signature",
    signedAt: 1700000000000,
  }),
}));

beforeEach(() => {
  wsInstances = [];
  vi.stubGlobal("WebSocket", MockWebSocket);
  vi.stubGlobal("crypto", { randomUUID: () => "test-uuid" });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function getLatestWs(): MockWebSocket {
  const ws = wsInstances[wsInstances.length - 1];
  if (!ws) throw new Error("No WebSocket instance");
  return ws;
}

async function completeHandshake(ws: MockWebSocket) {
  act(() => {
    ws.simulateHandshake();
  });
  // Wait for async Ed25519 signing to resolve and connect frame to be sent
  await waitFor(() => {
    expect(ws.sent.length).toBeGreaterThanOrEqual(1);
  });
  // Now send hello-ok
  act(() => {
    ws.sendHelloOk();
  });
}

describe("useGateway", () => {
  it("starts disconnected then connects after handshake", async () => {
    const { result } = renderHook(() => useGateway());

    expect(result.current.connected).toBe(false);

    const ws = getLatestWs();
    await completeHandshake(ws);

    expect(result.current.connected).toBe(true);
    const connectFrame = JSON.parse(ws.sent[0] as string);
    expect(connectFrame.method).toBe("connect");
  });

  it("sends a message and creates placeholder", async () => {
    const { result } = renderHook(() => useGateway());

    const ws = getLatestWs();
    await completeHandshake(ws);

    act(() => {
      result.current.sendMessage("Hello");
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0]?.role).toBe("user");
    expect(result.current.messages[0]?.content).toBe("Hello");
    expect(result.current.messages[1]?.role).toBe("assistant");
    expect(result.current.messages[1]?.pending).toBe(true);
    expect(result.current.pending).toBe(true);
  });

  it("clears messages", async () => {
    const { result } = renderHook(() => useGateway());

    const ws = getLatestWs();
    await completeHandshake(ws);

    act(() => {
      result.current.sendMessage("Hello");
    });

    expect(result.current.messages).toHaveLength(2);

    act(() => {
      result.current.clearMessages();
    });

    expect(result.current.messages).toEqual([]);
    expect(result.current.pending).toBe(false);
  });

  it("ignores empty messages", async () => {
    const { result } = renderHook(() => useGateway());

    const ws = getLatestWs();
    await completeHandshake(ws);

    act(() => {
      result.current.sendMessage("   ");
    });

    expect(result.current.messages).toEqual([]);
  });
});

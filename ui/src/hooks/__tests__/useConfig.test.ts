import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useConfig } from "../useConfig";

const mockConfig = {
  agent: { model: "deepseek/deepseek-chat" },
  gateway: { port: 18789 },
  deepseek: { apiKey: "test-key" },
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("useConfig", () => {
  it("loads config on mount", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockConfig),
    } as Response);

    const { result } = renderHook(() => useConfig());

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.config).toEqual(mockConfig);
    expect(result.current.isConfigured).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it("handles load error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 404,
    } as Response);

    const { result } = renderHook(() => useConfig());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe("Failed to load config");
    expect(result.current.config).toBeNull();
  });

  it("reports unconfigured when no model set", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    } as Response);

    const { result } = renderHook(() => useConfig());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.isConfigured).toBe(false);
  });

  it("deep merges nested fields on updateConfig (does not overwrite sibling keys)", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            agent: { model: "minimax/MiniMax-M2.7" },
            minimax: { apiKey: "old-key" },
            gateway: { port: 18789 },
          }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      } as Response);

    const { result } = renderHook(() => useConfig());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Update only agent.model — gateway and minimax should be preserved
    await act(async () => {
      await result.current.updateConfig({ agent: { model: "deepseek/deepseek-chat" } });
    });

    expect(result.current.config?.agent?.model).toBe("deepseek/deepseek-chat");
    // gateway must not be wiped out by the shallow-merge bug
    expect((result.current.config as Record<string, unknown> | null)?.gateway).toEqual({
      port: 18789,
    });
  });

  it("updates config via setModel", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockConfig),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      } as Response);

    const { result } = renderHook(() => useConfig());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.setModel("openai/gpt-4o");
    });

    expect(result.current.config?.agent?.model).toBe("openai/gpt-4o");
  });
});

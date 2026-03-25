import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useUpdate } from "../useUpdate";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("useUpdate", () => {
  it("checks version and reports up to date", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ version: "1.0.0" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ version: "3.22.0" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ tag_name: "v1.0.0" }),
      } as Response);

    const { result } = renderHook(() => useUpdate());

    await act(async () => {
      await result.current.checkForUpdates();
    });

    await waitFor(() => {
      expect(result.current.checking).toBe(false);
    });

    expect(result.current.versionInfo).toEqual({
      current: "1.0.0",
      latest: "1.0.0",
      updateAvailable: false,
      openclawVersion: "3.22.0",
    });
  });

  it("detects available update", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ version: "1.0.0" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ version: "3.22.0" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ tag_name: "v1.1.0" }),
      } as Response);

    const { result } = renderHook(() => useUpdate());

    await act(async () => {
      await result.current.checkForUpdates();
    });

    await waitFor(() => {
      expect(result.current.checking).toBe(false);
    });

    expect(result.current.versionInfo?.updateAvailable).toBe(true);
    expect(result.current.versionInfo?.latest).toBe("1.1.0");
  });

  it("handles network error gracefully", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ version: "1.0.0" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({}),
      } as Response)
      .mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() => useUpdate());

    await act(async () => {
      await result.current.checkForUpdates();
    });

    await waitFor(() => {
      expect(result.current.checking).toBe(false);
    });

    expect(result.current.versionInfo?.current).toBe("1.0.0");
    expect(result.current.versionInfo?.updateAvailable).toBe(false);
  });

  it("correctly detects update when minor version crosses 10 (semver ordering)", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ version: "1.9.0" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ version: "3.22.0" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ tag_name: "v1.10.0" }),
      } as Response);

    const { result } = renderHook(() => useUpdate());

    await act(async () => {
      await result.current.checkForUpdates();
    });

    await waitFor(() => {
      expect(result.current.checking).toBe(false);
    });

    // 1.10.0 > 1.9.0, updateAvailable must be true
    expect(result.current.versionInfo?.updateAvailable).toBe(true);
  });

  it("handles version check failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response);

    const { result } = renderHook(() => useUpdate());

    await act(async () => {
      await result.current.checkForUpdates();
    });

    await waitFor(() => {
      expect(result.current.checking).toBe(false);
    });

    expect(result.current.error).toBeTruthy();
  });

  it("exposes triggerUpdate and updateStatus with correct defaults", () => {
    const { result } = renderHook(() => useUpdate());

    expect(typeof result.current.triggerUpdate).toBe("function");
    expect(result.current.updating).toBe(false);
    expect(result.current.updateStatus).toEqual({
      status: "idle",
      progress: 0,
      error: null,
      version: null,
    });
  });
});

import { useState, useCallback, useEffect, useRef } from "react";
import type { VersionInfo } from "../types";
import { getVersion } from "../utils/config";

const GITHUB_REPO = "Austin5925/PocketClaw";
const GITHUB_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
const API_BASE = "/api";
const POLL_INTERVAL = 2000;

/** Returns >0 if a > b, <0 if a < b, 0 if equal. Handles "v" prefix. */
function compareSemver(a: string, b: string): number {
  const parse = (s: string) => s.replace(/^v/, "").split(".").map(Number);
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export interface UpdateStatus {
  status: "idle" | "checking" | "downloading" | "backing_up" | "extracting" | "migrating" | "complete" | "error";
  progress: number;
  error: string | null;
  version: string | null;
}

interface UseUpdateReturn {
  versionInfo: VersionInfo | null;
  checking: boolean;
  error: string | null;
  checkForUpdates: () => Promise<void>;
  triggerUpdate: () => Promise<void>;
  updateStatus: UpdateStatus;
  updating: boolean;
}

export function useUpdate(): UseUpdateReturn {
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({
    status: "idle",
    progress: 0,
    error: null,
    version: null,
  });
  const [updating, setUpdating] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollingRef.current !== null) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const pollStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/update/status`);
      if (res.ok) {
        const data = (await res.json()) as UpdateStatus;
        setUpdateStatus(data);
        if (data.status === "idle" || data.status === "complete" || data.status === "error") {
          stopPolling();
          if (data.status === "complete" || data.status === "error") {
            setUpdating(false);
          }
        }
      }
    } catch {
      // Network error during polling, keep trying
    }
  }, [stopPolling]);

  const startPolling = useCallback(() => {
    stopPolling();
    pollingRef.current = setInterval(() => {
      void pollStatus();
    }, POLL_INTERVAL);
  }, [stopPolling, pollStatus]);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  const checkForUpdates = useCallback(async () => {
    setChecking(true);
    setError(null);

    try {
      const { version: current } = await getVersion();

      let latest: string | undefined;
      try {
        const res = await fetch(GITHUB_API, {
          headers: { Accept: "application/vnd.github.v3+json" },
        });
        if (res.ok) {
          const data = (await res.json()) as { tag_name: string };
          latest = data.tag_name.replace(/^v/, "");
        }
      } catch {
        // offline or rate-limited, just show current version
      }

      setVersionInfo({
        current,
        latest,
        updateAvailable: latest ? compareSemver(latest, current) > 0 : false,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Version check failed");
    } finally {
      setChecking(false);
    }
  }, []);

  const triggerUpdate = useCallback(async () => {
    setUpdating(true);
    setUpdateStatus({
      status: "checking",
      progress: 5,
      error: null,
      version: null,
    });

    startPolling();

    try {
      const res = await fetch(`${API_BASE}/update`, { method: "POST" });
      const data = (await res.json()) as {
        alreadyUpToDate?: boolean;
        success?: boolean;
        version?: string;
        error?: string;
      };

      if (data.alreadyUpToDate) {
        setUpdateStatus({ status: "idle", progress: 0, error: null, version: null });
        setUpdating(false);
        stopPolling();
      }
      // For success/error, the polling will pick up the final state
    } catch (e) {
      setUpdateStatus({
        status: "error",
        progress: 0,
        error: e instanceof Error ? e.message : "更新请求失败",
        version: null,
      });
      setUpdating(false);
      stopPolling();
    }
  }, [startPolling, stopPolling]);

  return { versionInfo, checking, error, checkForUpdates, triggerUpdate, updateStatus, updating };
}

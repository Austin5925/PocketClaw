import { useEffect, useState } from "react";
import { useUpdate } from "../hooks/useUpdate";
import type { UpdateStatus } from "../hooks/useUpdate";

const STATUS_LABELS: Record<UpdateStatus["status"], string> = {
  idle: "",
  checking: "正在检查版本...",
  downloading: "正在下载更新包...",
  backing_up: "正在备份当前版本...",
  extracting: "正在解压更新文件...",
  migrating: "正在迁移数据...",
  complete: "更新完成",
  error: "更新失败",
};

export function UpdateChecker() {
  const { versionInfo, checking, error, checkForUpdates, triggerUpdate, updateStatus, updating } =
    useUpdate();
  const [manualOpen, setManualOpen] = useState(false);

  useEffect(() => {
    void checkForUpdates();
  }, [checkForUpdates]);

  const isInProgress =
    updating &&
    updateStatus.status !== "idle" &&
    updateStatus.status !== "complete" &&
    updateStatus.status !== "error";

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
      <h3 className="mb-3 font-semibold text-gray-900 dark:text-gray-100">系统更新</h3>

      {checking && <p className="text-sm text-gray-500">正在检查更新...</p>}

      {error && <p className="mb-2 text-sm text-amber-600">{error}</p>}

      {versionInfo && !checking && (
        <div className="space-y-2">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            口袋龙虾：v{versionInfo.current}
          </p>
          {versionInfo.openclawVersion && (
            <p className="text-sm text-gray-700 dark:text-gray-300">
              OpenClaw 内核：v{versionInfo.openclawVersion}
            </p>
          )}
          {versionInfo.latest ? (
            <>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                最新版本：v{versionInfo.latest}
              </p>
              {versionInfo.updateAvailable ? (
                <p className="text-sm font-medium text-indigo-600">有新版本可用</p>
              ) : (
                <p className="text-sm text-emerald-600">已是最新版本</p>
              )}
            </>
          ) : (
            !error && <p className="text-sm text-gray-400">未能获取最新版本信息</p>
          )}
        </div>
      )}

      {/* Progress display during update */}
      {(isInProgress || updateStatus.status === "complete" || updateStatus.status === "error") && (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            {STATUS_LABELS[updateStatus.status]}
            {updateStatus.version && (
              <span className="ml-1 text-gray-500">(v{updateStatus.version})</span>
            )}
          </p>
          {isInProgress && (
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-600">
              <div
                className="h-full rounded-full bg-indigo-500 transition-all duration-300"
                style={{ width: `${updateStatus.progress}%` }}
              />
            </div>
          )}
          {updateStatus.status === "complete" && (
            <p className="text-sm font-medium text-emerald-600">
              更新完成，请关闭窗口重新启动口袋龙虾
            </p>
          )}
          {updateStatus.status === "error" && updateStatus.error && (
            <p className="text-sm text-red-600">{updateStatus.error}</p>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={() => void checkForUpdates()}
          disabled={checking || isInProgress}
          className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 disabled:opacity-50 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
        >
          {checking ? "检查中..." : "检查更新"}
        </button>

        {versionInfo?.updateAvailable && !isInProgress && updateStatus.status !== "complete" && (
          <button
            onClick={() => void triggerUpdate()}
            disabled={updating}
            className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-600 disabled:opacity-50"
          >
            一键更新
          </button>
        )}
      </div>

      {/* Manual update instructions */}
      <div className="mt-3">
        <button
          onClick={() => setManualOpen(!manualOpen)}
          className="text-sm text-gray-500 transition-colors hover:text-gray-700 dark:hover:text-gray-300"
        >
          {manualOpen ? "\u25BC" : "\u25B6"} 手动更新方法
        </button>
        {manualOpen && (
          <p className="mt-1 text-sm text-gray-500">
            在 system 文件夹中找到 update.bat（Windows）或 update.sh（Mac），双击运行
          </p>
        )}
      </div>
    </div>
  );
}

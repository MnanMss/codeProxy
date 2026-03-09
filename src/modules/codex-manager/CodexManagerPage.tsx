import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Users,
  BarChart3,
  Plus,
  Upload,
  Download,
  Trash2,
  RefreshCw,
  Power,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { CodexManagerAccountListData, CodexManagerImportData } from "@/lib/http/types";
import {
  normalizeCodexManagerImportContentForCompatibility,
  normalizeCodexManagerImportContents,
} from "@/lib/http/apis/codex-manager-import";
import { Card } from "@/modules/ui/Card";
import { Button } from "@/modules/ui/Button";
import { EmptyState } from "@/modules/ui/EmptyState";
import {
  useCodexManagerData,
  useCodexManagerActions,
  type CodexManagerTab,
  CODEX_MANAGER_DEFAULT_TAB,
} from "@/modules/codex-manager";

const TAB_CONFIG: { id: CodexManagerTab; label: string; icon: typeof Users }[] = [
  { id: "accounts", label: "账号管理", icon: Users },
  { id: "quota", label: "配额查看", icon: BarChart3 },
];

const CODEX_MANAGER_EXPORT_FILENAME = "codex-manager-accounts.zip";

const readImportFileText = async (file: File): Promise<string> => {
  if (typeof file.text === "function") {
    return file.text();
  }

  return new Response(file).text();
};

const readImportFileContents = async (files: File[]): Promise<string[]> => {
  const contents: string[] = [];

  for (const file of files) {
    try {
      const text = await readImportFileText(file);
      if (String(text ?? "").trim()) {
        contents.push(text);
      }
    } catch {}
  }

  return contents;
};

const downloadExportBlob = (blob: Blob, filename = CODEX_MANAGER_EXPORT_FILENAME): boolean => {
  const createObjectURL = window.URL?.createObjectURL;
  if (typeof createObjectURL !== "function") {
    return false;
  }

  const objectUrl = createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.style.display = "none";

  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.URL?.revokeObjectURL?.(objectUrl);

  return true;
};

function TabButton({
  active,
  onClick,
  children,
  "data-testid": dataTestId,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  "data-testid"?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={dataTestId}
      className={[
        "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition",
        active
          ? "bg-slate-900 text-white dark:bg-white dark:text-neutral-950"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function AccountsTab({
  resources,
  dataState,
  dataActions,
  actionHooks,
}: {
  resources: ReturnType<typeof useCodexManagerData>["resources"];
  dataState: ReturnType<typeof useCodexManagerData>["state"];
  dataActions: ReturnType<typeof useCodexManagerData>["actions"];
  actionHooks: ReturnType<typeof useCodexManagerActions>;
}) {
  const { accountsList } = resources;
  const {
    loadAccountsList,
    loadSelectedAccountDetail,
    loadSelectedAccountUsage,
    setSelectedAccountId,
    setSelectedAccountIds,
    toggleSelectedAccountId,
    setAccountsQuery,
  } = dataActions;
  const accountsQuery = dataState.accountsQuery;
  const { state: actionState, actions } = actionHooks;

  const selectedAccountIds = dataState.selection.selectedAccountIds;
  const selectedAccountId = dataState.selection.selectedAccountId;

  // Login flow state
  const [activeLoginId, setActiveLoginId] = useState<string | null>(null);
  const [loginState, setLoginState] = useState<string>("");
  const [loginCode, setLoginCode] = useState<string>("");
  const [showCompleteLogin, setShowCompleteLogin] = useState(false);
  const [loginTimedOut, setLoginTimedOut] = useState(false);
  const loginStartTimeRef = useRef<number | null>(null);

  const LOGIN_POLLING_TIMEOUT_MS = 5 * 60 * 1000;

  // Import state
  const [importContent, setImportContent] = useState<string>("");
  const [showImportInput, setShowImportInput] = useState(false);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void loadAccountsList();
  }, [loadAccountsList]);

  useEffect(() => {
    if (!activeLoginId) return;

    loginStartTimeRef.current = Date.now();
    setLoginTimedOut(false);

    const isTerminalStatus = (status: string | undefined): boolean => {
      if (!status) return false;
      const terminalStates = ["success", "failed", "cancelled", "timed_out"];
      return terminalStates.includes(status);
    };

    const poll = async () => {
      const elapsed = Date.now() - (loginStartTimeRef.current ?? Date.now());
      if (elapsed >= LOGIN_POLLING_TIMEOUT_MS) {
        setLoginTimedOut(true);
        setActiveLoginId(null);
        return;
      }

      const result = await actions.getLoginStatus(activeLoginId);
      if (result?.terminal || isTerminalStatus(result?.status)) {
        if (result?.status === "success") {
          void loadAccountsList();
        }
        setActiveLoginId(null);
      }
    };

    void poll();

    const intervalId = setInterval(() => {
      void poll();
    }, 2000);

    return () => clearInterval(intervalId);
  }, [activeLoginId, actions, loadAccountsList]);

  const handleRefreshOne = useCallback(
    (accountId: string) => {
      void actions.refreshAccountUsage(accountId).then(() => {
        void loadAccountsList();
        if (selectedAccountId === accountId) {
          void loadSelectedAccountDetail();
          void loadSelectedAccountUsage();
        }
      });
    },
    [
      actions,
      loadAccountsList,
      selectedAccountId,
      loadSelectedAccountDetail,
      loadSelectedAccountUsage,
    ],
  );

  const handleRefreshBatch = useCallback(() => {
    if (selectedAccountIds.length === 0) return;
    void actions.refreshUsageBatch(selectedAccountIds).then(() => {
      void loadAccountsList();
      if (selectedAccountId && selectedAccountIds.includes(selectedAccountId)) {
        void loadSelectedAccountDetail();
        void loadSelectedAccountUsage();
      }
    });
  }, [
    actions,
    selectedAccountIds,
    loadAccountsList,
    selectedAccountId,
    loadSelectedAccountDetail,
    loadSelectedAccountUsage,
  ]);

  const handleDelete = useCallback(
    (accountId: string) => {
      void actions.deleteAccount(accountId).then((result) => {
        if (result) {
          if (selectedAccountId === accountId) {
            setSelectedAccountId(null);
          }
          if (selectedAccountIds.includes(accountId)) {
            toggleSelectedAccountId(accountId);
          }
          void loadAccountsList();
        }
      });
    },
    [
      actions,
      loadAccountsList,
      selectedAccountId,
      selectedAccountIds,
      setSelectedAccountId,
      toggleSelectedAccountId,
    ],
  );

  const handleRelayToggle = useCallback(
    (accountId: string, currentState: boolean) => {
      void actions.setRelayState(accountId, !currentState).then(() => {
        void loadAccountsList();
      });
    },
    [actions, loadAccountsList],
  );

  const reconcileSelectionAfterRefresh = useCallback(
    (listData: CodexManagerAccountListData | null) => {
      if (!listData) return;

      const availableAccountIds = new Set(listData.items.map((item) => item.accountId));
      const nextSelectedAccountIds = selectedAccountIds.filter((accountId) =>
        availableAccountIds.has(accountId),
      );

      if (nextSelectedAccountIds.length !== selectedAccountIds.length) {
        setSelectedAccountIds(nextSelectedAccountIds);
      }

      if (selectedAccountId && !availableAccountIds.has(selectedAccountId)) {
        setSelectedAccountId(null);
      }
    },
    [selectedAccountId, selectedAccountIds, setSelectedAccountId, setSelectedAccountIds],
  );

  const handleStartLogin = useCallback(() => {
    void actions.startLogin({ openBrowser: true }).then((result) => {
      if (result?.loginId) {
        setActiveLoginId(result.loginId);
      }
    });
  }, [actions]);

  const handleCompleteLogin = useCallback(() => {
    if (!loginState || !loginCode) return;
    void actions.completeLogin({ state: loginState, code: loginCode }).then((result) => {
      if (result?.completed === true) {
        setLoginState("");
        setLoginCode("");
        setShowCompleteLogin(false);
        void loadAccountsList();
      }
    });
  }, [actions, loginState, loginCode, loadAccountsList]);

  const handleImportResult = useCallback(
    (result: CodexManagerImportData | null) => {
      if (!result) return;

      void loadAccountsList();
      if (result.failed === 0) {
        setImportContent("");
        setShowImportInput(false);
        if (importFileInputRef.current) {
          importFileInputRef.current.value = "";
        }
      }
    },
    [loadAccountsList],
  );

  const handleImport = useCallback(() => {
    const content = normalizeCodexManagerImportContentForCompatibility(importContent);
    if (!content) return;

    void actions.importAccounts({ content }).then(handleImportResult);
  }, [actions, handleImportResult, importContent]);

  const handleImportFiles = useCallback(
    async (files: File[]) => {
      const contents = normalizeCodexManagerImportContents({
        contents: await readImportFileContents(files),
      });
      if (contents.length === 0) return;

      const result = await actions.importAccounts({ contents });
      handleImportResult(result);
    },
    [actions, handleImportResult],
  );

  const handleImportFileSelection = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.currentTarget.files ?? []);
      event.currentTarget.value = "";
      if (files.length === 0) return;

      void handleImportFiles(files);
    },
    [handleImportFiles],
  );

  const handleOpenImportFilePicker = useCallback(() => {
    importFileInputRef.current?.click();
  }, []);

  const handleExport = useCallback(() => {
    void actions.exportAccounts().then((blob) => {
      if (!blob) return;
      downloadExportBlob(blob);
    });
  }, [actions]);

  const handleDeleteUnavailable = useCallback(() => {
    void actions.deleteUnavailableAccounts().then(async (result) => {
      if (!result) return;

      const nextAccountsList = await loadAccountsList();
      reconcileSelectionAfterRefresh(nextAccountsList);

      if (
        selectedAccountId &&
        nextAccountsList?.items.some((item) => item.accountId === selectedAccountId)
      ) {
        void loadSelectedAccountDetail();
        void loadSelectedAccountUsage();
      }
    });
  }, [
    actions,
    loadAccountsList,
    loadSelectedAccountDetail,
    loadSelectedAccountUsage,
    reconcileSelectionAfterRefresh,
    selectedAccountId,
  ]);

  // Helper to get status icon and color
  const getLoginStatusDisplay = (status: string | undefined) => {
    switch (status) {
      case "success":
        return { icon: CheckCircle, color: "text-emerald-600", label: "成功" };
      case "failed":
        return { icon: XCircle, color: "text-rose-600", label: "失败" };
      case "cancelled":
        return { icon: XCircle, color: "text-slate-500", label: "已取消" };
      case "timed_out":
        return { icon: Clock, color: "text-amber-600", label: "超时" };
      case "in_progress":
        return { icon: RefreshCw, color: "text-blue-600", label: "进行中" };
      default:
        return { icon: AlertCircle, color: "text-slate-500", label: status || "未知" };
    }
  };

  return (
    <Card
      title="Codex 账号列表"
      description="管理 Codex 账号，查看详情与操作"
      loading={accountsList.loading}
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleStartLogin}
            disabled={actionState.pending.startLogin}
            data-testid="codex-login-start"
          >
            <Plus size={14} className="mr-1" />
            登录
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowImportInput((v) => !v)}
            disabled={actionState.pending.importAccounts}
            data-testid="codex-import-button"
          >
            <Upload size={14} className="mr-1" />
            导入
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExport}
            disabled={actionState.pending.exportAccounts}
            data-testid="codex-export-button"
          >
            <Download size={14} className="mr-1" />
            {actionState.pending.exportAccounts ? "导出中..." : "导出"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleDeleteUnavailable}
            disabled={actionState.pending.deleteUnavailableAccounts}
            data-testid="codex-delete-unavailable-button"
          >
            <Trash2 size={14} className="mr-1" />
            {actionState.pending.deleteUnavailableAccounts ? "清理中..." : "删除不可用免费"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowCompleteLogin((v) => !v)}
            disabled={actionState.pending.completeLogin}
            data-testid="codex-complete-login-toggle"
          >
            <CheckCircle size={14} className="mr-1" />
            完成登录
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRefreshBatch}
            disabled={selectedAccountIds.length === 0 || actionState.pending.refreshUsageBatch}
            data-testid="codex-refresh-selected"
          >
            <RefreshCw size={14} className="mr-1" />
            刷新选中
          </Button>
          <Button variant="secondary" size="sm" onClick={() => void loadAccountsList()}>
            刷新列表
          </Button>
        </div>
      }
    >
      <div data-testid="codex-accounts-table" className="min-h-[200px]">
        {/* Login Status Display */}
        {(activeLoginId || loginTimedOut) && (
          <div
            data-testid="codex-login-status-panel"
            className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900/50 dark:bg-blue-900/20"
          >
            <div className="flex items-center gap-2">
              {(() => {
                const status = loginTimedOut
                  ? "timed_out"
                  : actionState.result.getLoginStatus?.status;
                const StatusIcon = getLoginStatusDisplay(status).icon;
                const statusColor = getLoginStatusDisplay(status).color;
                const statusLabel = getLoginStatusDisplay(status).label;
                return (
                  <>
                    <StatusIcon size={16} className={statusColor} />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      登录状态: <span className={statusColor}>{statusLabel}</span>
                    </span>
                  </>
                );
              })()}
              {actionState.pending.getLoginStatus && !loginTimedOut && (
                <RefreshCw size={14} className="ml-2 animate-spin text-blue-600" />
              )}
            </div>
            {activeLoginId && (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Login ID: {activeLoginId}
              </p>
            )}
            {actionState.result.getLoginStatus?.error && !loginTimedOut && (
              <p className="mt-1 text-xs text-rose-600">
                错误: {actionState.result.getLoginStatus.error}
              </p>
            )}
          </div>
        )}

        {/* Complete Login Form */}
        {showCompleteLogin && (
          <div
            data-testid="codex-complete-login-panel"
            className="mb-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950"
          >
            <h4 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">完成登录</h4>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">
                  State
                </label>
                <input
                  type="text"
                  value={loginState}
                  onChange={(e) => setLoginState(e.target.value)}
                  placeholder="输入 state 参数"
                  data-testid="codex-login-state-input"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">
                  Code
                </label>
                <input
                  type="text"
                  value={loginCode}
                  onChange={(e) => setLoginCode(e.target.value)}
                  placeholder="输入 code 参数"
                  data-testid="codex-login-code-input"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
                />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleCompleteLogin}
                  disabled={!loginState || !loginCode || actionState.pending.completeLogin}
                  data-testid="codex-complete-login-submit"
                >
                  {actionState.pending.completeLogin ? "提交中..." : "提交"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowCompleteLogin(false)}
                  data-testid="codex-complete-login-cancel"
                >
                  取消
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Import Input Area */}
        {showImportInput && (
          <div
            data-testid="codex-import-panel"
            className="mb-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950"
          >
            <h4 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">导入账号</h4>
            <input
              ref={importFileInputRef}
              type="file"
              accept=".json,application/json"
              multiple
              onChange={handleImportFileSelection}
              data-testid="codex-import-file-input"
              className="hidden"
            />
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-3 dark:border-neutral-800 dark:bg-neutral-900/40">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    批量选择 JSON 文件
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    支持一次选择多个浏览器文件并自动批量导入；下方文本框仍可作为兼容兜底。
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleOpenImportFilePicker}
                  disabled={actionState.pending.importAccounts}
                  data-testid="codex-import-file-button"
                >
                  <Upload size={14} className="mr-1" />
                  选择文件
                </Button>
              </div>
            </div>
            <div className="my-3 flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500">
              <span className="h-px flex-1 bg-slate-200 dark:bg-neutral-800" />
              <span>或粘贴内容导入</span>
              <span className="h-px flex-1 bg-slate-200 dark:bg-neutral-800" />
            </div>
            <textarea
              value={importContent}
              onChange={(e) => setImportContent(e.target.value)}
              placeholder="在此粘贴要导入的账号内容..."
              rows={4}
              data-testid="codex-import-textarea"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
            />
            <div className="mt-3 flex items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={handleImport}
                disabled={!importContent.trim() || actionState.pending.importAccounts}
                data-testid="codex-import-submit"
              >
                {actionState.pending.importAccounts ? "导入中..." : "确认导入"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowImportInput(false)}
                data-testid="codex-import-cancel"
              >
                取消
              </Button>
            </div>
          </div>
        )}

        {actionState.result.refreshUsageBatch && (
          <div
            data-testid="codex-batch-refresh-result"
            className="mb-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950"
          >
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white">批量刷新结果</h4>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-emerald-600">
                  成功: {actionState.result.refreshUsageBatch.successCount}
                </span>
                <span className="text-rose-600">
                  失败: {actionState.result.refreshUsageBatch.failedCount}
                </span>
                <span className="text-slate-500">
                  总计: {actionState.result.refreshUsageBatch.total}
                </span>
              </div>
            </div>
            {actionState.result.refreshUsageBatch.items.length > 0 && (
              <div className="max-h-48 overflow-y-auto space-y-1">
                {actionState.result.refreshUsageBatch.items.map((item) => (
                  <div
                    key={item.accountId}
                    data-testid={`codex-batch-refresh-item-${item.accountId}`}
                    className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900/50"
                  >
                    <div className="flex items-center gap-2">
                      {item.success ? (
                        <CheckCircle size={14} className="text-emerald-600" />
                      ) : (
                        <XCircle size={14} className="text-rose-600" />
                      )}
                      <span className="text-sm text-slate-700 dark:text-slate-300">
                        {item.accountId}
                      </span>
                    </div>
                    {!item.success && item.reason && (
                      <span
                        className="text-xs text-rose-600"
                        data-testid={`codex-batch-refresh-reason-${item.accountId}`}
                      >
                        {item.reason}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                value={accountsQuery.query}
                onChange={(e) => setAccountsQuery({ query: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    void loadAccountsList();
                  }
                }}
                placeholder="搜索账号..."
                data-testid="codex-accounts-search-input"
                className="h-9 w-48 rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-white sm:w-64"
              />
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void loadAccountsList()}
              data-testid="codex-accounts-search-button"
            >
              <Search size={14} />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="text-xs text-slate-500 dark:text-slate-400"
              data-testid="codex-accounts-pagination-info"
            >
              第 {accountsList.data.page} 页 · 共{" "}
              {Math.ceil(accountsList.data.total / accountsList.data.pageSize) || 1} 页 ·{" "}
              {accountsList.data.total} 条
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  const newPage = Math.max(1, accountsQuery.page - 1);
                  setAccountsQuery({ page: newPage });
                  void loadAccountsList({ page: newPage });
                }}
                disabled={accountsQuery.page <= 1}
                data-testid="codex-accounts-prev-page"
              >
                <ChevronLeft size={14} />
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  const maxPage =
                    Math.ceil(accountsList.data.total / accountsList.data.pageSize) || 1;
                  const newPage = Math.min(maxPage, accountsQuery.page + 1);
                  setAccountsQuery({ page: newPage });
                  void loadAccountsList({ page: newPage });
                }}
                disabled={
                  accountsQuery.page >=
                  Math.ceil(accountsList.data.total / accountsList.data.pageSize)
                }
                data-testid="codex-accounts-next-page"
              >
                <ChevronRight size={14} />
              </Button>
            </div>
          </div>
        </div>

        {accountsList.data.items.length === 0 && !accountsList.loading ? (
          <EmptyState title="暂无账号" description="当前没有 Codex 账号数据" />
        ) : (
          <div className="space-y-2">
            {accountsList.data.items.map((item) => (
              <div
                key={item.accountId}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950/50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedAccountIds.includes(item.accountId)}
                      onChange={() => toggleSelectedAccountId(item.accountId)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                      {item.label || item.accountId}
                    </p>
                    <span
                      data-testid={`codex-runtime-badge-${item.accountId}`}
                      className={[
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                        item.stale
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                          : item.runtimeIncluded
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                            : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
                      ].join(" ")}
                    >
                      {item.stale
                        ? "来源不可用"
                        : item.runtimeIncluded
                          ? "已纳入 CliRelay 调用"
                          : "已本地禁用"}
                      {item.relayEnabled && " · Relay"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 ml-6">
                    ID: {item.accountId} · 状态: {item.status}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    data-testid={`codex-relay-toggle-${item.accountId}`}
                    onClick={() => handleRelayToggle(item.accountId, item.relayEnabled)}
                    disabled={actionState.pending.setRelayState}
                    className={[
                      "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition",
                      item.relayEnabled
                        ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400",
                    ].join(" ")}
                  >
                    <Power size={12} />
                    {item.relayEnabled ? "Relay开" : "Relay关"}
                  </button>
                  <button
                    type="button"
                    data-testid={`codex-refresh-one-${item.accountId}`}
                    onClick={() => handleRefreshOne(item.accountId)}
                    disabled={actionState.pending.refreshAccountUsage}
                    className="inline-flex items-center rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                  >
                    <RefreshCw size={14} />
                  </button>
                  <button
                    type="button"
                    data-testid={`codex-delete-button-${item.accountId}`}
                    onClick={() => handleDelete(item.accountId)}
                    disabled={actionState.pending.deleteAccount}
                    className="inline-flex items-center rounded-lg p-1.5 text-rose-500 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-900/30"
                  >
                    <Trash2 size={14} />
                  </button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setSelectedAccountId(item.accountId)}
                    data-testid={`codex-view-button-${item.accountId}`}
                  >
                    查看
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function QuotaTab({
  resources,
  dataState,
  dataActions,
}: {
  resources: ReturnType<typeof useCodexManagerData>["resources"];
  dataState: ReturnType<typeof useCodexManagerData>["state"];
  dataActions: ReturnType<typeof useCodexManagerData>["actions"];
}) {
  const { usageList } = resources;
  const { loadUsageList, setUsageQuery } = dataActions;
  const usageQuery = dataState.usageQuery;

  useEffect(() => {
    void loadUsageList();
  }, [loadUsageList]);

  return (
    <Card
      title="Codex 配额统计"
      description="查看 Codex 账号配额使用情况"
      loading={usageList.loading}
      actions={
        <Button variant="secondary" size="sm" onClick={() => void loadUsageList()}>
          刷新
        </Button>
      }
    >
      <div className="min-h-[200px]">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                value={usageQuery.query}
                onChange={(e) => setUsageQuery({ query: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    void loadUsageList();
                  }
                }}
                placeholder="搜索配额..."
                data-testid="codex-quota-search-input"
                className="h-9 w-48 rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-white sm:w-64"
              />
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void loadUsageList()}
              data-testid="codex-quota-search-button"
            >
              <Search size={14} />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="text-xs text-slate-500 dark:text-slate-400"
              data-testid="codex-quota-pagination-info"
            >
              第 {usageList.data.page} 页 · 共{" "}
              {Math.ceil(usageList.data.total / usageList.data.pageSize) || 1} 页 ·{" "}
              {usageList.data.total} 条
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  const newPage = Math.max(1, usageQuery.page - 1);
                  setUsageQuery({ page: newPage });
                  void loadUsageList({ page: newPage });
                }}
                disabled={usageQuery.page <= 1}
                data-testid="codex-quota-prev-page"
              >
                <ChevronLeft size={14} />
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  const maxPage = Math.ceil(usageList.data.total / usageList.data.pageSize) || 1;
                  const newPage = Math.min(maxPage, usageQuery.page + 1);
                  setUsageQuery({ page: newPage });
                  void loadUsageList({ page: newPage });
                }}
                disabled={
                  usageQuery.page >= Math.ceil(usageList.data.total / usageList.data.pageSize)
                }
                data-testid="codex-quota-next-page"
              >
                <ChevronRight size={14} />
              </Button>
            </div>
          </div>
        </div>

        {usageList.data.items.length === 0 && !usageList.loading ? (
          <EmptyState title="暂无配额数据" description="当前没有 Codex 配额数据" />
        ) : (
          <div className="space-y-2">
            {usageList.data.items.map((item) => (
              <div
                key={item.accountId}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950/50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                    {item.accountId}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function AccountDetailDrawer({
  resources,
  dataState,
  dataActions,
}: {
  resources: ReturnType<typeof useCodexManagerData>["resources"];
  dataState: ReturnType<typeof useCodexManagerData>["state"];
  dataActions: ReturnType<typeof useCodexManagerData>["actions"];
}) {
  const { accountDetail, accountUsage } = resources;
  const { setSelectedAccountId, loadSelectedAccountDetail, loadSelectedAccountUsage } = dataActions;

  const isOpen = !!dataState.selection.selectedAccountId;

  useEffect(() => {
    if (isOpen) {
      void loadSelectedAccountDetail();
      void loadSelectedAccountUsage();
    }
  }, [isOpen, loadSelectedAccountDetail, loadSelectedAccountUsage]);

  if (!isOpen) return null;

  return (
    <div data-testid="codex-account-detail-drawer" className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={() => setSelectedAccountId(null)}
        aria-hidden="true"
      />
      <div className="relative z-10 h-full w-full max-w-md border-l border-slate-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-950">
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-neutral-800">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">账号详情</h3>
            <Button variant="ghost" size="sm" onClick={() => setSelectedAccountId(null)}>
              关闭
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            {accountDetail.loading ? (
              <div className="py-8 text-center text-sm text-slate-500">加载中…</div>
            ) : accountDetail.error ? (
              <div className="py-8 text-center text-sm text-rose-500">{accountDetail.error}</div>
            ) : accountDetail.data ? (
              <div className="space-y-6">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">账号 ID</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    {accountDetail.data.accountId}
                  </p>
                </div>

                {accountUsage.data && (
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">用量信息</p>
                    <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-100 p-3 text-xs dark:bg-neutral-900">
                      {JSON.stringify(accountUsage.data, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function CodexManagerPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { state, resources, actions: dataActions } = useCodexManagerData();
  const actionHooks = useCodexManagerActions();

  const activeTab = useMemo<CodexManagerTab>(() => {
    const tab = searchParams.get("tab");
    if (tab === "quota") return "quota";
    return CODEX_MANAGER_DEFAULT_TAB;
  }, [searchParams]);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (!tab) {
      setSearchParams({ tab: CODEX_MANAGER_DEFAULT_TAB });
    }
  }, [searchParams, setSearchParams]);

  const setActiveTab = useCallback(
    (tab: CodexManagerTab) => {
      setSearchParams({ tab });
      dataActions.setActiveTab(tab);
    },
    [setSearchParams, dataActions],
  );

  return (
    <div data-testid="codex-manager-page" className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {TAB_CONFIG.map((tab) => {
          const Icon = tab.icon;
          return (
            <TabButton
              key={tab.id}
              active={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              data-testid={`codex-tab-${tab.id}`}
            >
              <Icon size={16} />
              {tab.label}
            </TabButton>
          );
        })}
      </div>

      {activeTab === "accounts" && (
        <AccountsTab
          resources={resources}
          dataState={state}
          dataActions={dataActions}
          actionHooks={actionHooks}
        />
      )}
      {activeTab === "quota" && (
        <QuotaTab resources={resources} dataState={state} dataActions={dataActions} />
      )}

      <AccountDetailDrawer resources={resources} dataState={state} dataActions={dataActions} />
    </div>
  );
}

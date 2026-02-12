import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, RefreshCw, ScrollText, Trash2 } from "lucide-react";
import { logsApi } from "@/lib/http/apis";
import { TextInput } from "@/modules/ui/Input";
import { Card } from "@/modules/ui/Card";
import { Button } from "@/modules/ui/Button";
import { ToggleSwitch } from "@/modules/ui/ToggleSwitch";
import { EmptyState } from "@/modules/ui/EmptyState";
import { Modal } from "@/modules/ui/Modal";
import { ConfirmModal } from "@/modules/ui/ConfirmModal";
import { useToast } from "@/modules/ui/ToastProvider";

type ErrorLogItem = { name: string; size?: number; modified?: number };

const INITIAL_DISPLAY_LINES = 200;
const LOAD_MORE_LINES = 200;
const MAX_BUFFER_LINES = 10000;
const LOAD_MORE_THRESHOLD_PX = 64;

const normalizeBaseUrl = (value: string): string => {
  let trimmed = value.trim();
  if (!trimmed) return "";
  trimmed = trimmed.replace(/\/+$/g, "");
  return trimmed;
};

const isManagementTraffic = (line: string): boolean => {
  const lowered = line.toLowerCase();
  return lowered.includes("/v0/management") || lowered.includes("v0/management");
};

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export function LogsPage() {
  const { notify } = useToast();

  const [buffer, setBuffer] = useState<string[]>([]);
  const [latestTimestamp, setLatestTimestamp] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [hideManagement, setHideManagement] = useState(true);
  const [search, setSearch] = useState("");
  const [displayCount, setDisplayCount] = useState(INITIAL_DISPLAY_LINES);

  const [errorLogsOpen, setErrorLogsOpen] = useState(false);
  const [errorLogsLoading, setErrorLogsLoading] = useState(false);
  const [errorLogs, setErrorLogs] = useState<ErrorLogItem[]>([]);

  const [requestLogId, setRequestLogId] = useState("");
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  // 用 ref 存储瞬时轮询状态，避免把它们放进 useCallback 依赖导致 effect 循环触发与 loading 闪烁。
  const latestTimestampRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);
  const notifyRef = useRef(notify);

  useEffect(() => {
    notifyRef.current = notify;
  }, [notify]);

  const filteredLines = useMemo(() => {
    const q = search.trim().toLowerCase();
    return buffer.filter((line) => {
      if (hideManagement && isManagementTraffic(line)) return false;
      if (!q) return true;
      return line.toLowerCase().includes(q);
    });
  }, [buffer, hideManagement, search]);

  const visibleLines = useMemo(() => {
    if (filteredLines.length <= displayCount) return filteredLines;
    return filteredLines.slice(filteredLines.length - displayCount);
  }, [displayCount, filteredLines]);

  const canLoadMore = filteredLines.length > visibleLines.length;

  const trimAndAppend = useCallback((current: string[], next: string[]) => {
    const merged = [...current, ...next];
    if (merged.length <= MAX_BUFFER_LINES) return merged;
    return merged.slice(merged.length - MAX_BUFFER_LINES);
  }, []);

  const fetchLogs = useCallback(
    async (options: { mode: "full" | "incremental"; showIndicator?: boolean }) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      const shouldBlockUi = options.mode === "full";
      if (shouldBlockUi) setLoading(true);
      if (options.showIndicator) setRefreshing(true);

      try {
        const after =
          options.mode === "incremental" ? latestTimestampRef.current ?? undefined : undefined;

        const result = await logsApi.fetchLogs(after ? { after } : {});
        const lines = Array.isArray(result?.lines) ? result.lines : [];
        const nextLatest =
          typeof result?.["latest-timestamp"] === "number" ? result["latest-timestamp"] : null;

        if (typeof nextLatest === "number") {
          const mergedLatest =
            typeof latestTimestampRef.current === "number"
              ? Math.max(latestTimestampRef.current, nextLatest)
              : nextLatest;
          latestTimestampRef.current = mergedLatest;
          setLatestTimestamp(mergedLatest);
        }

        if (lines.length) {
          setBuffer((prev) => trimAndAppend(prev, lines));
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "日志拉取失败";
        notifyRef.current({ type: "error", message });
      } finally {
        if (shouldBlockUi) setLoading(false);
        if (options.showIndicator) setRefreshing(false);
        inFlightRef.current = false;
      }
    },
    [trimAndAppend],
  );

  useEffect(() => {
    void fetchLogs({ mode: "full" });
  }, [fetchLogs]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(() => {
      void fetchLogs({ mode: "incremental" });
    }, 3000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, fetchLogs]);

  const onScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!canLoadMore) return;
    if (el.scrollTop > LOAD_MORE_THRESHOLD_PX) return;
    setDisplayCount((prev) => prev + LOAD_MORE_LINES);
  }, [canLoadMore]);

  const handleRefresh = useCallback(() => {
    void fetchLogs({ mode: "incremental", showIndicator: true });
  }, [fetchLogs]);

  const handleClearServerLogs = useCallback(async () => {
    try {
      await logsApi.clearLogs();
      setBuffer([]);
      setLatestTimestamp(null);
      latestTimestampRef.current = null;
      setDisplayCount(INITIAL_DISPLAY_LINES);
      notify({ type: "success", message: "已清空服务器日志" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "清空日志失败";
      notify({ type: "error", message });
    }
  }, [notify]);

  const handleOpenErrorLogs = useCallback(async () => {
    setErrorLogsOpen(true);
    setErrorLogsLoading(true);
    try {
      const result = await logsApi.fetchErrorLogs();
      const files = Array.isArray(result?.files) ? (result.files as ErrorLogItem[]) : [];
      setErrorLogs(files);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "获取错误日志列表失败";
      notify({ type: "error", message });
    } finally {
      setErrorLogsLoading(false);
    }
  }, [notify]);

  const downloadErrorLog = useCallback(
    async (file: ErrorLogItem) => {
      try {
        const blob = await logsApi.downloadErrorLog(file.name);
        downloadBlob(blob, file.name);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "下载错误日志失败";
        notify({ type: "error", message });
      }
    },
    [notify],
  );

  const handleDownloadRequestLog = useCallback(async () => {
    const id = requestLogId.trim();
    if (!id) {
      notify({ type: "info", message: "请输入请求 ID" });
      return;
    }
    try {
      const blob = await logsApi.downloadRequestLogById(id);
      downloadBlob(blob, `request-log-${id}.log`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "下载请求日志失败";
      notify({ type: "error", message });
    }
  }, [notify, requestLogId]);

  const latestLabel = useMemo(() => {
    if (!latestTimestamp) return "--";
    const date = new Date(latestTimestamp * 1000);
    return Number.isNaN(date.getTime()) ? String(latestTimestamp) : date.toLocaleString();
  }, [latestTimestamp]);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">日志查询</h2>
        <p className="text-sm text-slate-600 dark:text-white/65">
          支持实时拉取、搜索过滤、自动刷新与错误日志下载。
        </p>
      </header>

      <Card
        title="实时日志"
        description={`最新时间：${latestLabel}（仅保留前端缓冲最近 ${MAX_BUFFER_LINES} 行）`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleOpenErrorLogs}
              disabled={loading || refreshing}
            >
              <Download size={14} />
              错误日志
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleRefresh}
              disabled={loading || refreshing}
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
              刷新
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => setConfirmClearOpen(true)}
              disabled={loading || refreshing}
            >
              <Trash2 size={14} />
              清空
            </Button>
          </div>
        }
        loading={loading}
      >
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <TextInput
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              placeholder="搜索关键字（大小写不敏感）…"
              type="search"
              name="log_search"
              autoComplete="off"
              spellCheck={false}
              endAdornment={<ScrollText size={16} className="text-slate-400" />}
            />
          </div>
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
            <ToggleSwitch
              label="自动刷新"
              description="每 3 秒拉取增量日志"
              checked={autoRefresh}
              onCheckedChange={setAutoRefresh}
              disabled={loading}
            />
            <ToggleSwitch
              label="屏蔽管理端流量"
              description="过滤 /v0/management 相关日志"
              checked={hideManagement}
              onCheckedChange={setHideManagement}
              disabled={loading}
            />
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-white/70 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 text-xs text-slate-600 dark:border-neutral-800 dark:text-white/65">
            <span className="tabular-nums">
              显示 {visibleLines.length.toLocaleString()} / {filteredLines.length.toLocaleString()} 行
              {canLoadMore ? "（滚动到顶部自动加载更多）" : ""}
            </span>
            <div className="flex items-center gap-2">
              <TextInput
                value={requestLogId}
                onChange={(e) => setRequestLogId(e.currentTarget.value)}
                placeholder="请求 ID（8位）…"
                name="request_log_id"
                autoComplete="off"
                spellCheck={false}
                className="h-9 w-44 rounded-xl px-3 py-2 text-xs"
              />
              <Button variant="secondary" size="sm" onClick={handleDownloadRequestLog} disabled={loading}>
                下载请求日志
              </Button>
            </div>
          </div>
          <div
            ref={containerRef}
            onScroll={onScroll}
            className="max-h-[60vh] overflow-y-auto px-4 py-3"
          >
            {visibleLines.length === 0 ? (
              <EmptyState
                title="暂无日志"
                description="你可以点击“刷新”或开启“自动刷新”来拉取最新日志。"
              />
            ) : (
              <div className="space-y-1 font-mono text-xs leading-relaxed text-slate-800 dark:text-slate-100">
                {visibleLines.map((line, idx) => (
                  <pre
                    key={`${normalizeBaseUrl(line)}:${idx}`}
                    className="whitespace-pre-wrap break-words rounded-lg px-2 py-1 hover:bg-slate-50 dark:hover:bg-white/5"
                  >
                    {line}
                  </pre>
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>

      <Modal
        open={errorLogsOpen}
        title="错误日志文件"
        description="从服务器拉取错误日志文件列表并支持下载。"
        onClose={() => setErrorLogsOpen(false)}
        footer={
          <Button variant="secondary" onClick={() => setErrorLogsOpen(false)}>
            关闭
          </Button>
        }
      >
        {errorLogsLoading ? (
          <div className="text-sm text-slate-600 dark:text-white/65">加载中…</div>
        ) : errorLogs.length === 0 ? (
          <EmptyState title="暂无错误日志" description="当前服务器没有可下载的错误日志文件。" />
        ) : (
          <div className="space-y-2">
            {errorLogs.map((file) => (
              <div
                key={file.name}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60"
              >
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs text-slate-900 dark:text-white">{file.name}</p>
                  <p className="mt-1 text-xs text-slate-600 dark:text-white/65">
                    {typeof file.size === "number" ? `${file.size.toLocaleString()} bytes` : "--"} ·{" "}
                    {typeof file.modified === "number"
                      ? new Date(file.modified < 1e12 ? file.modified * 1000 : file.modified).toLocaleString()
                      : "--"}
                  </p>
                </div>
                <Button variant="secondary" size="sm" onClick={() => void downloadErrorLog(file)}>
                  <Download size={14} />
                  下载
                </Button>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={confirmClearOpen}
        title="清空服务器日志"
        description="确定要清空服务器日志吗？此操作不可恢复。"
        confirmText="清空"
        onClose={() => setConfirmClearOpen(false)}
        onConfirm={() => {
          setConfirmClearOpen(false);
          void handleClearServerLogs();
        }}
      />
    </div>
  );
}

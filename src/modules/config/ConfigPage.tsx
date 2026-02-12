import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { RefreshCw, Save, Settings, Terminal } from "lucide-react";
import { configApi, configFileApi } from "@/lib/http/apis";
import { Card } from "@/modules/ui/Card";
import { Button } from "@/modules/ui/Button";
import { EmptyState } from "@/modules/ui/EmptyState";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/modules/ui/Tabs";
import { TextInput } from "@/modules/ui/Input";
import { ToggleSwitch } from "@/modules/ui/ToggleSwitch";
import { useToast } from "@/modules/ui/ToastProvider";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const readString = (obj: Record<string, unknown> | null, ...keys: string[]): string => {
  if (!obj) return "";
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
};

const readBool = (obj: Record<string, unknown> | null, ...keys: string[]): boolean => {
  if (!obj) return false;
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const lowered = value.trim().toLowerCase();
      if (lowered === "true") return true;
      if (lowered === "false") return false;
    }
    if (typeof value === "number") return value !== 0;
  }
  return false;
};

const readNumber = (obj: Record<string, unknown> | null, ...keys: string[]): number | null => {
  if (!obj) return null;
  for (const key of keys) {
    const value = obj[key];
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

export function ConfigPage() {
  const { notify } = useToast();
  const [isPending, startTransition] = useTransition();

  const [tab, setTab] = useState<"runtime" | "yaml">("runtime");

  const [loading, setLoading] = useState(true);
  const [rawConfig, setRawConfig] = useState<Record<string, unknown> | null>(null);

  const [debugEnabled, setDebugEnabled] = useState(false);
  const [usageStatisticsEnabled, setUsageStatisticsEnabled] = useState(false);
  const [requestLogEnabled, setRequestLogEnabled] = useState(false);
  const [loggingToFileEnabled, setLoggingToFileEnabled] = useState(false);
  const [wsAuthEnabled, setWsAuthEnabled] = useState(false);
  const [switchProjectEnabled, setSwitchProjectEnabled] = useState(false);
  const [switchPreviewModelEnabled, setSwitchPreviewModelEnabled] = useState(false);
  const [forceModelPrefixEnabled, setForceModelPrefixEnabled] = useState(false);

  const [proxyUrl, setProxyUrl] = useState("");
  const [requestRetry, setRequestRetry] = useState("0");
  const [logsMaxTotalSizeMb, setLogsMaxTotalSizeMb] = useState("0");
  const [routingStrategy, setRoutingStrategy] = useState("round-robin");

  const [yamlLoading, setYamlLoading] = useState(false);
  const [yamlSaving, setYamlSaving] = useState(false);
  const [yamlText, setYamlText] = useState("");
  const [yamlDirty, setYamlDirty] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchPositions, setSearchPositions] = useState<number[]>([]);
  const [searchIndex, setSearchIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const loadRuntimeConfig = useCallback(async () => {
    setLoading(true);
    try {
      const [config, logsLimit, forcePrefix, strategy] = await Promise.all([
        configApi.getConfig(),
        configApi.getLogsMaxTotalSizeMb().catch(() => 0),
        configApi.getForceModelPrefix().catch(() => false),
        configApi.getRoutingStrategy().catch(() => "round-robin"),
      ]);

      const record = isRecord(config) ? (config as Record<string, unknown>) : null;
      setRawConfig(record);

      setDebugEnabled(readBool(record, "debug", "debug-enabled", "debugEnabled"));
      setUsageStatisticsEnabled(readBool(record, "usage-statistics-enabled", "usageStatisticsEnabled"));
      setRequestLogEnabled(readBool(record, "request-log", "requestLog"));
      setLoggingToFileEnabled(readBool(record, "logging-to-file", "loggingToFile"));
      setWsAuthEnabled(readBool(record, "ws-auth", "wsAuth"));
      setSwitchProjectEnabled(readBool(record, "quota-exceeded.switch-project", "switchProject"));
      setSwitchPreviewModelEnabled(readBool(record, "quota-exceeded.switch-preview-model", "switchPreviewModel"));

      setProxyUrl(readString(record, "proxy-url", "proxyUrl"));
      const retry = readNumber(record, "request-retry", "requestRetry");
      setRequestRetry(retry !== null ? String(retry) : "0");

      setLogsMaxTotalSizeMb(String(logsLimit ?? 0));
      setForceModelPrefixEnabled(Boolean(forcePrefix));
      setRoutingStrategy(typeof strategy === "string" ? strategy : "round-robin");
    } catch (err: unknown) {
      notify({ type: "error", message: err instanceof Error ? err.message : "加载配置失败" });
    } finally {
      setLoading(false);
    }
  }, [notify]);

  const loadYaml = useCallback(async () => {
    setYamlLoading(true);
    try {
      const text = await configFileApi.fetchConfigYaml();
      setYamlText(text);
      setYamlDirty(false);
      setSearchPositions([]);
      setSearchIndex(0);
    } catch (err: unknown) {
      notify({ type: "error", message: err instanceof Error ? err.message : "加载 config.yaml 失败" });
    } finally {
      setYamlLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void loadRuntimeConfig();
  }, [loadRuntimeConfig]);

  useEffect(() => {
    if (tab !== "yaml") return;
    if (yamlText) return;
    void loadYaml();
  }, [loadYaml, tab, yamlText]);

  useEffect(() => {
    if (!yamlDirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [yamlDirty]);

  const saveYaml = useCallback(async () => {
    setYamlSaving(true);
    try {
      await configFileApi.saveConfigYaml(yamlText);
      const latest = await configFileApi.fetchConfigYaml();
      setYamlText(latest);
      setYamlDirty(false);
      notify({ type: "success", message: "已保存 config.yaml" });
    } catch (err: unknown) {
      notify({ type: "error", message: err instanceof Error ? err.message : "保存失败" });
    } finally {
      setYamlSaving(false);
    }
  }, [notify, yamlText]);

  const updateToggle = useCallback(
    async (key: string, next: boolean) => {
      try {
        if (key === "debug") await configApi.updateDebug(next);
        if (key === "usage") await configApi.updateUsageStatistics(next);
        if (key === "requestLog") await configApi.updateRequestLog(next);
        if (key === "loggingToFile") await configApi.updateLoggingToFile(next);
        if (key === "wsAuth") await configApi.updateWsAuth(next);
        if (key === "switchProject") await configApi.updateSwitchProject(next);
        if (key === "switchPreviewModel") await configApi.updateSwitchPreviewModel(next);
        if (key === "forceModelPrefix") await configApi.updateForceModelPrefix(next);
        notify({ type: "success", message: "已更新" });
      } catch (err: unknown) {
        notify({ type: "error", message: err instanceof Error ? err.message : "更新失败" });
        throw err;
      }
    },
    [notify],
  );

  const saveTextValue = useCallback(
    async (key: string, value: string) => {
      try {
        if (key === "proxyUrl") {
          const trimmed = value.trim();
          if (trimmed) {
            await configApi.updateProxyUrl(trimmed);
          } else {
            await configApi.clearProxyUrl();
          }
        }
        if (key === "requestRetry") {
          const parsed = Number(value.trim());
          if (!Number.isFinite(parsed) || parsed < 0) {
            notify({ type: "error", message: "重试次数必须是非负数字" });
            return;
          }
          await configApi.updateRequestRetry(Math.round(parsed));
        }
        if (key === "logsMaxTotalSizeMb") {
          const parsed = Number(value.trim());
          if (!Number.isFinite(parsed) || parsed < 0) {
            notify({ type: "error", message: "日志大小上限必须是非负数字" });
            return;
          }
          await configApi.updateLogsMaxTotalSizeMb(Math.round(parsed));
        }
        if (key === "routingStrategy") {
          const trimmed = value.trim();
          if (!trimmed) {
            notify({ type: "error", message: "路由策略不能为空" });
            return;
          }
          await configApi.updateRoutingStrategy(trimmed);
        }
        notify({ type: "success", message: "已保存" });
        startTransition(() => void loadRuntimeConfig());
      } catch (err: unknown) {
        notify({ type: "error", message: err instanceof Error ? err.message : "保存失败" });
      }
    },
    [loadRuntimeConfig, notify, startTransition],
  );

  const searchStats = useMemo(() => {
    if (!searchPositions.length) return { current: 0, total: 0 };
    return { current: searchIndex + 1, total: searchPositions.length };
  }, [searchIndex, searchPositions.length]);

  const buildSearchPositions = useCallback(
    (query: string) => {
      const text = yamlText;
      const q = query.trim();
      if (!q) return [];
      const lowerText = text.toLowerCase();
      const lowerQ = q.toLowerCase();
      const positions: number[] = [];
      let pos = 0;
      while (pos < lowerText.length) {
        const idx = lowerText.indexOf(lowerQ, pos);
        if (idx === -1) break;
        positions.push(idx);
        pos = idx + 1;
        if (positions.length >= 2000) break;
      }
      return positions;
    },
    [yamlText],
  );

  const jumpToMatch = useCallback(
    (index: number) => {
      const el = textareaRef.current;
      if (!el) return;
      const q = searchQuery.trim();
      if (!q) return;
      const positions = searchPositions;
      if (!positions.length) return;
      const safe = ((index % positions.length) + positions.length) % positions.length;
      const start = positions[safe];
      el.focus();
      el.setSelectionRange(start, start + q.length);
      setSearchIndex(safe);
    },
    [searchPositions, searchQuery],
  );

  const executeSearch = useCallback(() => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchPositions([]);
      setSearchIndex(0);
      return;
    }
    const positions = buildSearchPositions(q);
    setSearchPositions(positions);
    if (positions.length) {
      setSearchIndex(0);
      const el = textareaRef.current;
      if (el) {
        const start = positions[0];
        el.focus();
        el.setSelectionRange(start, start + q.length);
      }
    } else {
      notify({ type: "info", message: "未找到匹配项" });
    }
  }, [buildSearchPositions, notify, searchQuery]);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">配置面板</h2>
        <p className="text-sm text-slate-600 dark:text-white/65">
          管理运行时开关与在线编辑 `config.yaml`。
        </p>
      </header>

      <Tabs value={tab} onValueChange={(next) => setTab(next as typeof tab)}>
        <TabsList>
          <TabsTrigger value="runtime">
            <Settings size={14} />
            运行配置
          </TabsTrigger>
          <TabsTrigger value="yaml">
            <Terminal size={14} />
            config.yaml
          </TabsTrigger>
        </TabsList>

        <TabsContent value="runtime">
          <Card
            title="运行开关"
            description="这些配置将通过管理 API 写入服务端。"
            actions={
              <Button variant="secondary" size="sm" onClick={() => void loadRuntimeConfig()} disabled={loading || isPending}>
                <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                刷新
              </Button>
            }
            loading={loading}
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-3 rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
                <ToggleSwitch
                  label="Debug 模式"
                  description="开启后会输出更多调试日志（建议临时开启）。"
                  checked={debugEnabled}
                  onCheckedChange={(next) => {
                    setDebugEnabled(next);
                    void updateToggle("debug", next).catch(() => setDebugEnabled((prev) => !prev));
                  }}
                />
                <ToggleSwitch
                  label="使用统计"
                  description="开启后统计请求与 Token 使用情况。"
                  checked={usageStatisticsEnabled}
                  onCheckedChange={(next) => {
                    setUsageStatisticsEnabled(next);
                    void updateToggle("usage", next).catch(() => setUsageStatisticsEnabled((prev) => !prev));
                  }}
                />
                <ToggleSwitch
                  label="请求日志"
                  description="开启后记录请求日志（用于日志查询与问题排查）。"
                  checked={requestLogEnabled}
                  onCheckedChange={(next) => {
                    setRequestLogEnabled(next);
                    void updateToggle("requestLog", next).catch(() => setRequestLogEnabled((prev) => !prev));
                  }}
                />
                <ToggleSwitch
                  label="写入日志文件"
                  description="开启后将日志输出到文件（便于下载错误日志）。"
                  checked={loggingToFileEnabled}
                  onCheckedChange={(next) => {
                    setLoggingToFileEnabled(next);
                    void updateToggle("loggingToFile", next).catch(() => setLoggingToFileEnabled((prev) => !prev));
                  }}
                />
              </div>

              <div className="space-y-3 rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
                <ToggleSwitch
                  label="WebSocket 鉴权"
                  description="开启后 WebSocket 连接将进行鉴权校验。"
                  checked={wsAuthEnabled}
                  onCheckedChange={(next) => {
                    setWsAuthEnabled(next);
                    void updateToggle("wsAuth", next).catch(() => setWsAuthEnabled((prev) => !prev));
                  }}
                />
                <ToggleSwitch
                  label="强制模型前缀"
                  description="开启后会强制要求模型前缀（与路由策略相关）。"
                  checked={forceModelPrefixEnabled}
                  onCheckedChange={(next) => {
                    setForceModelPrefixEnabled(next);
                    void updateToggle("forceModelPrefix", next).catch(() => setForceModelPrefixEnabled((prev) => !prev));
                  }}
                />
                <ToggleSwitch
                  label="配额回退：切换项目"
                  description="当配额超限时尝试切换项目。"
                  checked={switchProjectEnabled}
                  onCheckedChange={(next) => {
                    setSwitchProjectEnabled(next);
                    void updateToggle("switchProject", next).catch(() => setSwitchProjectEnabled((prev) => !prev));
                  }}
                />
                <ToggleSwitch
                  label="配额回退：切换预览模型"
                  description="当配额超限时尝试切换预览模型。"
                  checked={switchPreviewModelEnabled}
                  onCheckedChange={(next) => {
                    setSwitchPreviewModelEnabled(next);
                    void updateToggle("switchPreviewModel", next).catch(() => setSwitchPreviewModelEnabled((prev) => !prev));
                  }}
                />
              </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <Card
                title="代理与重试"
                description="用于请求代理与失败重试策略。"
                actions={
                  <Button variant="secondary" size="sm" onClick={() => void saveTextValue("proxyUrl", proxyUrl)}>
                    <Save size={14} />
                    保存代理
                  </Button>
                }
              >
                <div className="space-y-3">
                  <TextInput
                    value={proxyUrl}
                    onChange={(e) => setProxyUrl(e.currentTarget.value)}
                    placeholder="proxy-url（为空则清除）"
                  />
                  <div className="flex items-center gap-2">
                    <TextInput
                      value={requestRetry}
                      onChange={(e) => setRequestRetry(e.currentTarget.value)}
                      placeholder="request-retry（非负整数）"
                      inputMode="numeric"
                    />
                    <Button variant="secondary" size="sm" onClick={() => void saveTextValue("requestRetry", requestRetry)}>
                      <Save size={14} />
                      保存重试
                    </Button>
                  </div>
                </div>
              </Card>

              <Card
                title="日志与路由"
                description="控制日志总大小上限与路由策略。"
                actions={
                  <Button variant="secondary" size="sm" onClick={() => void loadRuntimeConfig()}>
                    <RefreshCw size={14} />
                    重新读取
                  </Button>
                }
              >
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <TextInput
                      value={logsMaxTotalSizeMb}
                      onChange={(e) => setLogsMaxTotalSizeMb(e.currentTarget.value)}
                      placeholder="logs-max-total-size-mb"
                      inputMode="numeric"
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void saveTextValue("logsMaxTotalSizeMb", logsMaxTotalSizeMb)}
                    >
                      <Save size={14} />
                      保存
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <TextInput
                      value={routingStrategy}
                      onChange={(e) => setRoutingStrategy(e.currentTarget.value)}
                      placeholder="routing-strategy（如 round-robin）"
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void saveTextValue("routingStrategy", routingStrategy)}
                    >
                      <Save size={14} />
                      保存
                    </Button>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-white/65">
                    当前 config 预览：{rawConfig ? "已加载" : "未加载"}
                  </p>
                </div>
              </Card>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="yaml">
          <Card
            title="config.yaml"
            description="在线编辑并保存服务端 config.yaml。"
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => void loadYaml()} disabled={yamlLoading || yamlSaving}>
                  <RefreshCw size={14} className={yamlLoading ? "animate-spin" : ""} />
                  刷新
                </Button>
                <Button variant="primary" size="sm" onClick={() => void saveYaml()} disabled={!yamlDirty || yamlSaving}>
                  <Save size={14} />
                  {yamlSaving ? "保存中…" : "保存"}
                </Button>
              </div>
            }
            loading={yamlLoading}
          >
            {!yamlLoading && !yamlText ? (
              <EmptyState
                title="空内容"
                description="服务端可能未配置 config.yaml 或接口返回为空。"
              />
            ) : (
              <div className="space-y-3">
                <div className="grid gap-3 lg:grid-cols-3">
                  <div className="lg:col-span-2">
                    <TextInput
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.currentTarget.value)}
                      placeholder="搜索（回车执行，Shift+回车反向）"
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        e.preventDefault();
                        const q = searchQuery.trim();
                        if (!q) return;
                        if (!searchPositions.length) {
                          executeSearch();
                          return;
                        }
                        if (e.shiftKey) {
                          jumpToMatch(searchIndex - 1);
                        } else {
                          jumpToMatch(searchIndex + 1);
                        }
                      }}
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
                    <span className="text-xs text-slate-600 dark:text-white/65 tabular-nums">
                      {searchStats.total ? `${searchStats.current}/${searchStats.total}` : "--"}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button variant="secondary" size="sm" onClick={executeSearch} disabled={!searchQuery.trim()}>
                        搜索
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => jumpToMatch(searchIndex - 1)}
                        disabled={!searchPositions.length}
                      >
                        上一个
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => jumpToMatch(searchIndex + 1)}
                        disabled={!searchPositions.length}
                      >
                        下一个
                      </Button>
                    </div>
                  </div>
                </div>

                <textarea
                  ref={textareaRef}
                  value={yamlText}
                  onChange={(e) => {
                    setYamlText(e.currentTarget.value);
                    setYamlDirty(true);
                    setSearchPositions([]);
                    setSearchIndex(0);
                  }}
                  className="min-h-[60vh] w-full resize-y rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none transition focus-visible:ring-2 focus-visible:ring-slate-400/35 dark:border-neutral-800 dark:bg-neutral-950 dark:text-slate-100 dark:focus-visible:ring-white/15"
                  spellCheck={false}
                  aria-label="config.yaml 编辑器"
                />
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

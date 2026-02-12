import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Download, Eye, FileJson, RefreshCw, Search, ShieldCheck, Trash2, Upload } from "lucide-react";
import { authFilesApi } from "@/lib/http/apis";
import type { AuthFileItem, OAuthModelAliasEntry } from "@/lib/http/types";
import { Card } from "@/modules/ui/Card";
import { Button } from "@/modules/ui/Button";
import { EmptyState } from "@/modules/ui/EmptyState";
import { Modal } from "@/modules/ui/Modal";
import { ConfirmModal } from "@/modules/ui/ConfirmModal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/modules/ui/Tabs";
import { TextInput } from "@/modules/ui/Input";
import { ToggleSwitch } from "@/modules/ui/ToggleSwitch";
import { useToast } from "@/modules/ui/ToastProvider";

type AuthFileModelItem = { id: string; display_name?: string; type?: string; owned_by?: string };

const MIN_PAGE_SIZE = 6;
const MAX_PAGE_SIZE = 30;

const clampPageSize = (value: number) =>
  Math.min(MAX_PAGE_SIZE, Math.max(MIN_PAGE_SIZE, Math.round(value)));

const formatFileSize = (bytes?: number): string => {
  const value = typeof bytes === "number" && Number.isFinite(bytes) ? bytes : 0;
  if (value <= 0) return "--";
  if (value < 1024) return `${value} B`;
  const kb = value / 1024;
  if (kb < 1024) return `${kb.toFixed(1).replace(/\\.0$/, "")} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1).replace(/\\.0$/, "")} MB`;
};

const formatModified = (file: AuthFileItem): string => {
  const raw = (file.modtime ?? file.modified) as unknown;
  if (!raw) return "--";
  const asNumber = Number(raw);
  const date =
    Number.isFinite(asNumber) && !Number.isNaN(asNumber)
      ? new Date(asNumber < 1e12 ? asNumber * 1000 : asNumber)
      : new Date(String(raw));
  return Number.isNaN(date.getTime()) ? "--" : date.toLocaleString();
};

const normalizeProviderKey = (value: string): string => value.trim().toLowerCase();

const TYPE_BADGE_CLASSES: Record<string, string> = {
  qwen: "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200",
  kimi: "bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200",
  gemini: "bg-blue-50 text-blue-800 dark:bg-blue-500/15 dark:text-blue-200",
  "gemini-cli": "bg-indigo-50 text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-200",
  aistudio: "bg-slate-50 text-slate-800 dark:bg-white/10 dark:text-slate-200",
  claude: "bg-rose-50 text-rose-800 dark:bg-rose-500/15 dark:text-rose-200",
  codex: "bg-orange-50 text-orange-800 dark:bg-orange-500/15 dark:text-orange-200",
  antigravity: "bg-teal-50 text-teal-800 dark:bg-teal-500/15 dark:text-teal-200",
  iflow: "bg-violet-50 text-violet-800 dark:bg-violet-500/15 dark:text-violet-200",
  vertex: "bg-cyan-50 text-cyan-800 dark:bg-cyan-500/15 dark:text-cyan-200",
  empty: "bg-slate-50 text-slate-600 dark:bg-white/10 dark:text-white/70",
  unknown: "bg-slate-50 text-slate-600 dark:bg-white/10 dark:text-white/70",
};

const resolveFileType = (file: AuthFileItem): string => {
  const type = typeof file.type === "string" ? file.type : "";
  const provider = typeof file.provider === "string" ? file.provider : "";
  const fromName = String(file.name || "").split(".")[0] ?? "";
  const candidate = normalizeProviderKey(type || provider || fromName);
  return candidate || "unknown";
};

const downloadTextAsFile = (content: string, filename: string) => {
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 800);
};

type AliasRow = OAuthModelAliasEntry & { id: string };

const buildAliasRows = (entries: OAuthModelAliasEntry[] | undefined): AliasRow[] => {
  if (!entries?.length) {
    return [{ id: `row-${Date.now()}`, name: "", alias: "" }];
  }
  return entries.map((entry) => ({
    id: `row-${entry.name}-${entry.alias}-${entry.fork ? "1" : "0"}`,
    ...entry,
  }));
};

export function AuthFilesPage() {
  const { notify } = useToast();
  const [isPending, startTransition] = useTransition();

  const [tab, setTab] = useState<"files" | "excluded" | "alias">("files");

  const [files, setFiles] = useState<AuthFileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState<Record<string, boolean>>({});
  const [confirm, setConfirm] = useState<null | { type: "deleteAll" } | { type: "deleteFile"; name: string }>(null);

  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(9);
  const [pageSizeInput, setPageSizeInput] = useState("9");

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailFile, setDetailFile] = useState<AuthFileItem | null>(null);
  const [detailText, setDetailText] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);

  const [modelsOpen, setModelsOpen] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsFileName, setModelsFileName] = useState("");
  const [modelsList, setModelsList] = useState<AuthFileModelItem[]>([]);

  const [excludedLoading, setExcludedLoading] = useState(false);
  const [excluded, setExcluded] = useState<Record<string, string[]>>({});
  const [excludedDraft, setExcludedDraft] = useState<Record<string, string>>({});
  const [excludedNewProvider, setExcludedNewProvider] = useState("");

  const [aliasLoading, setAliasLoading] = useState(false);
  const [aliasMap, setAliasMap] = useState<Record<string, OAuthModelAliasEntry[]>>({});
  const [aliasEditing, setAliasEditing] = useState<Record<string, AliasRow[]>>({});
  const [aliasNewChannel, setAliasNewChannel] = useState("");

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const data = await authFilesApi.list();
      const list = Array.isArray(data?.files) ? data.files : [];
      setFiles(list);
    } catch (err: unknown) {
      notify({ type: "error", message: err instanceof Error ? err.message : "加载认证文件失败" });
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  useEffect(() => {
    setPageSizeInput(String(pageSize));
  }, [pageSize]);

  const providerOptions = useMemo(() => {
    const set = new Set<string>();
    files.forEach((file) => set.add(resolveFileType(file)));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [files]);

  const filteredFiles = useMemo(() => {
    const q = search.trim().toLowerCase();
    const normalizedFilter = normalizeProviderKey(filter);
    return files.filter((file) => {
      const typeKey = resolveFileType(file);
      if (normalizedFilter && normalizedFilter !== "all" && typeKey !== normalizedFilter) return false;
      if (!q) return true;
      const name = String(file.name || "").toLowerCase();
      const provider = String(file.provider || "").toLowerCase();
      const type = String(file.type || "").toLowerCase();
      return name.includes(q) || provider.includes(q) || type.includes(q);
    });
  }, [files, filter, search]);

  const totalPages = Math.max(1, Math.ceil(filteredFiles.length / pageSize));
  const safePage = Math.min(totalPages, Math.max(1, page));
  const pageItems = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredFiles.slice(start, start + pageSize);
  }, [filteredFiles, pageSize, safePage]);

  useEffect(() => {
    if (safePage !== page) setPage(safePage);
  }, [page, safePage]);

  const openDetail = useCallback(
    async (file: AuthFileItem) => {
      setDetailOpen(true);
      setDetailFile(file);
      setDetailLoading(true);
      setDetailText("");
      try {
        const text = await authFilesApi.downloadText(file.name);
        setDetailText(text);
      } catch (err: unknown) {
        notify({ type: "error", message: err instanceof Error ? err.message : "读取文件失败" });
      } finally {
        setDetailLoading(false);
      }
    },
    [notify],
  );

  const openModels = useCallback(
    async (file: AuthFileItem) => {
      setModelsOpen(true);
      setModelsFileName(file.name);
      setModelsLoading(true);
      setModelsList([]);
      try {
        const list = await authFilesApi.getModelsForAuthFile(file.name);
        setModelsList(list);
      } catch (err: unknown) {
        notify({ type: "error", message: err instanceof Error ? err.message : "获取模型列表失败" });
      } finally {
        setModelsLoading(false);
      }
    },
    [notify],
  );

  const handleUpload = useCallback(
    async (file: File | null) => {
      if (!file) return;
      setUploading(true);
      try {
        await authFilesApi.upload(file);
        notify({ type: "success", message: "上传成功" });
        await loadFiles();
      } catch (err: unknown) {
        notify({ type: "error", message: err instanceof Error ? err.message : "上传失败" });
      } finally {
        setUploading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [loadFiles, notify],
  );

  const handleDelete = useCallback(
    async (name: string) => {
      try {
        await authFilesApi.deleteFile(name);
        setFiles((prev) => prev.filter((file) => file.name !== name));
        notify({ type: "success", message: "已删除" });
      } catch (err: unknown) {
        notify({ type: "error", message: err instanceof Error ? err.message : "删除失败" });
      }
    },
    [notify],
  );

  const handleDeleteAll = useCallback(async () => {
    setDeletingAll(true);
    try {
      await authFilesApi.deleteAll();
      setFiles([]);
      notify({ type: "success", message: "已删除全部认证文件" });
    } catch (err: unknown) {
      notify({ type: "error", message: err instanceof Error ? err.message : "删除失败" });
    } finally {
      setDeletingAll(false);
    }
  }, [notify]);

  const setFileDisabled = useCallback(
    async (file: AuthFileItem, disabled: boolean) => {
      const name = file.name;
      setStatusUpdating((prev) => ({ ...prev, [name]: true }));
      try {
        await authFilesApi.setStatus(name, disabled);
        setFiles((prev) =>
          prev.map((item) => (item.name === name ? { ...item, disabled } : item)),
        );
        notify({ type: "success", message: disabled ? "已禁用" : "已启用" });
      } catch (err: unknown) {
        notify({ type: "error", message: err instanceof Error ? err.message : "更新状态失败" });
      } finally {
        setStatusUpdating((prev) => ({ ...prev, [name]: false }));
      }
    },
    [notify],
  );

  const refreshExcluded = useCallback(async () => {
    setExcludedLoading(true);
    try {
      const map = await authFilesApi.getOauthExcludedModels();
      setExcluded(map);
      setExcludedDraft(
        Object.fromEntries(
          Object.entries(map).map(([key, value]) => [key, Array.isArray(value) ? value.join("\n") : ""]),
        ),
      );
    } catch (err: unknown) {
      notify({ type: "error", message: err instanceof Error ? err.message : "加载 OAuth 排除模型失败" });
    } finally {
      setExcludedLoading(false);
    }
  }, [notify]);

  const refreshAlias = useCallback(async () => {
    setAliasLoading(true);
    try {
      const map = await authFilesApi.getOauthModelAlias();
      setAliasMap(map);
      setAliasEditing(
        Object.fromEntries(Object.entries(map).map(([key, value]) => [key, buildAliasRows(value)])),
      );
    } catch (err: unknown) {
      notify({ type: "error", message: err instanceof Error ? err.message : "加载 OAuth 模型别名失败" });
    } finally {
      setAliasLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    if (tab === "excluded" && !excludedLoading && Object.keys(excluded).length === 0) {
      void refreshExcluded();
    }
    if (tab === "alias" && !aliasLoading && Object.keys(aliasMap).length === 0) {
      void refreshAlias();
    }
  }, [aliasLoading, aliasMap, excluded, excludedLoading, refreshAlias, refreshExcluded, tab]);

  const saveExcludedProvider = useCallback(
    async (provider: string, text: string) => {
      const key = normalizeProviderKey(provider);
      const models = text
        .split(/[\n,]+/)
        .map((item) => item.trim())
        .filter(Boolean);
      try {
        await authFilesApi.saveOauthExcludedModels(key, models);
        notify({ type: "success", message: "已保存" });
        startTransition(() => void refreshExcluded());
      } catch (err: unknown) {
        notify({ type: "error", message: err instanceof Error ? err.message : "保存失败" });
      }
    },
    [notify, refreshExcluded, startTransition],
  );

  const deleteExcludedProvider = useCallback(
    async (provider: string) => {
      const key = normalizeProviderKey(provider);
      try {
        await authFilesApi.deleteOauthExcludedEntry(key);
        notify({ type: "success", message: "已删除" });
        startTransition(() => void refreshExcluded());
      } catch (err: unknown) {
        notify({ type: "error", message: err instanceof Error ? err.message : "删除失败" });
      }
    },
    [notify, refreshExcluded, startTransition],
  );

  const addExcludedProvider = useCallback(() => {
    const key = normalizeProviderKey(excludedNewProvider);
    if (!key) {
      notify({ type: "info", message: "请输入 provider" });
      return;
    }
    setExcluded((prev) => (prev[key] ? prev : { ...prev, [key]: [] }));
    setExcludedDraft((prev) => (prev[key] !== undefined ? prev : { ...prev, [key]: "" }));
    setExcludedNewProvider("");
  }, [excludedNewProvider, notify]);

  const addAliasChannel = useCallback(() => {
    const key = normalizeProviderKey(aliasNewChannel);
    if (!key) {
      notify({ type: "info", message: "请输入 channel" });
      return;
    }
    setAliasMap((prev) => (prev[key] ? prev : { ...prev, [key]: [] }));
    setAliasEditing((prev) => (prev[key] ? prev : { ...prev, [key]: buildAliasRows([]) }));
    setAliasNewChannel("");
  }, [aliasNewChannel, notify]);

  const saveAliasChannel = useCallback(
    async (channel: string) => {
      const key = normalizeProviderKey(channel);
      const rows = aliasEditing[key] ?? [];
      const next = rows
        .map((row) => ({
          name: row.name.trim(),
          alias: row.alias.trim(),
          ...(row.fork ? { fork: true } : {}),
        }))
        .filter((row) => row.name && row.alias);
      try {
        await authFilesApi.saveOauthModelAlias(key, next);
        notify({ type: "success", message: "已保存" });
        startTransition(() => void refreshAlias());
      } catch (err: unknown) {
        notify({ type: "error", message: err instanceof Error ? err.message : "保存失败" });
      }
    },
    [aliasEditing, notify, refreshAlias, startTransition],
  );

  const deleteAliasChannel = useCallback(
    async (channel: string) => {
      const key = normalizeProviderKey(channel);
      try {
        await authFilesApi.deleteOauthModelAlias(key);
        notify({ type: "success", message: "已删除" });
        startTransition(() => void refreshAlias());
      } catch (err: unknown) {
        notify({ type: "error", message: err instanceof Error ? err.message : "删除失败" });
      }
    },
    [notify, refreshAlias, startTransition],
  );

  return (
    <div className="space-y-6">
      <Tabs value={tab} onValueChange={(next) => setTab(next as typeof tab)}>
        <TabsList>
          <TabsTrigger value="files">文件列表</TabsTrigger>
          <TabsTrigger value="excluded">OAuth 排除模型</TabsTrigger>
          <TabsTrigger value="alias">OAuth 模型别名</TabsTrigger>
        </TabsList>

        <TabsContent value="files">
          <Card
            title="认证文件管理"
            description="支持搜索、筛选与分页浏览。"
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => void loadFiles()} disabled={loading || isPending}>
                  <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                  刷新
                </Button>
                <label className="inline-flex">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,application/json"
                    className="hidden"
                    onChange={(e) => void handleUpload(e.currentTarget.files?.[0] ?? null)}
                  />
                  <span className="inline-flex">
                    <Button variant="primary" size="sm" disabled={uploading || loading}>
                      <Upload size={14} />
                      {uploading ? "上传中…" : "上传"}
                    </Button>
                  </span>
                </label>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setConfirm({ type: "deleteAll" })}
                  disabled={deletingAll || loading}
                >
                  <Trash2 size={14} />
                  {deletingAll ? "删除中…" : "删除全部"}
                </Button>
              </div>
            }
            loading={loading}
          >
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <TextInput
                  value={search}
                  onChange={(e) => {
                    setSearch(e.currentTarget.value);
                    setPage(1);
                  }}
                  placeholder="搜索文件名 / provider / type"
                  endAdornment={<Search size={16} className="text-slate-400" />}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
                <select
                  value={filter}
                  onChange={(e) => {
                    setFilter(e.currentTarget.value);
                    setPage(1);
                  }}
                  aria-label="类型筛选"
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-slate-400/35 dark:border-neutral-800 dark:bg-neutral-950 dark:text-slate-100 dark:focus-visible:ring-white/15"
                >
                  <option value="all">全部类型</option>
                  {providerOptions.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
                <div className="flex w-full items-center gap-2">
                  <TextInput
                    value={pageSizeInput}
                    onChange={(e) => setPageSizeInput(e.currentTarget.value)}
                    onBlur={() => {
                      const parsed = Number(pageSizeInput.trim());
                      if (!Number.isFinite(parsed)) {
                        setPageSizeInput(String(pageSize));
                        return;
                      }
                      const next = clampPageSize(parsed);
                      setPageSize(next);
                      setPageSizeInput(String(next));
                      setPage(1);
                    }}
                    className="h-10 rounded-xl px-3 py-2 text-sm"
                    placeholder="每页数量"
                    inputMode="numeric"
                  />
                  <span className="text-xs text-slate-600 dark:text-white/65 tabular-nums">
                    共 {filteredFiles.length.toLocaleString()} 个
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {pageItems.length === 0 ? (
                <div className="md:col-span-2 xl:col-span-3">
                  <EmptyState title="暂无认证文件" description="可以通过“上传”按钮导入 JSON 认证文件。" />
                </div>
              ) : (
                pageItems.map((file) => {
                  const typeKey = resolveFileType(file);
                  const badgeClass = TYPE_BADGE_CLASSES[typeKey] ?? TYPE_BADGE_CLASSES.unknown;
                  const disabled = Boolean(file.disabled);
                  const switching = Boolean(statusUpdating[file.name]);

                  return (
                    <article
                      key={file.name}
                      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/70"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-mono text-xs text-slate-900 dark:text-white">{file.name}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className={`inline-flex rounded-lg px-2 py-1 text-xs font-semibold ${badgeClass}`}>
                              {typeKey}
                            </span>
                            {disabled ? (
                              <span className="inline-flex rounded-lg bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 dark:bg-rose-500/15 dark:text-rose-200">
                                已禁用
                              </span>
                            ) : (
                              <span className="inline-flex rounded-lg bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">
                                已启用
                              </span>
                            )}
                          </div>
                          <p className="mt-2 text-xs text-slate-600 dark:text-white/65">
                            {formatFileSize(file.size)} · {formatModified(file)}
                          </p>
                        </div>
                        <div className="shrink-0">
                          <ToggleSwitch
                            ariaLabel="启用/禁用"
                            checked={!disabled}
                            onCheckedChange={(enabled) => void setFileDisabled(file, !enabled)}
                            disabled={switching}
                          />
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => void openDetail(file)}
                        >
                          <Eye size={14} />
                          查看
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => void openModels(file)}
                        >
                          <ShieldCheck size={14} />
                          模型
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={async () => {
                            try {
                              const text = await authFilesApi.downloadText(file.name);
                              downloadTextAsFile(text, file.name);
                            } catch (err: unknown) {
                              notify({ type: "error", message: err instanceof Error ? err.message : "下载失败" });
                            }
                          }}
                        >
                          <Download size={14} />
                          下载
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => setConfirm({ type: "deleteFile", name: file.name })}
                        >
                          <Trash2 size={14} />
                          删除
                        </Button>
                      </div>
                    </article>
                  );
                })
              )}
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-slate-600 dark:text-white/65 tabular-nums">
                第 {safePage} / {totalPages} 页
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={safePage <= 1}
                >
                  上一页
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={safePage >= totalPages}
                >
                  下一页
                </Button>
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="excluded">
          <Card
            title="OAuth 排除模型"
            description="按 provider 维护禁用模型列表（每行一个模型）。"
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => void refreshExcluded()} disabled={excludedLoading || isPending}>
                  <RefreshCw size={14} className={excludedLoading ? "animate-spin" : ""} />
                  刷新
                </Button>
              </div>
            }
            loading={excludedLoading}
          >
            <div className="flex flex-wrap items-center gap-2">
              <TextInput
                value={excludedNewProvider}
                onChange={(e) => setExcludedNewProvider(e.currentTarget.value)}
                placeholder="新增 provider（如 codex / gemini-cli）"
                endAdornment={<FileJson size={16} className="text-slate-400" />}
              />
              <Button variant="primary" size="sm" onClick={addExcludedProvider} disabled={isPending}>
                新增
              </Button>
            </div>

            <div className="mt-4 space-y-3">
              {Object.keys(excluded).length === 0 ? (
                <EmptyState title="暂无配置" description="你可以新增一个 provider 并保存排除模型列表。" />
              ) : (
                Object.entries(excluded)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([provider, models]) => {
                    const text = excludedDraft[provider] ?? (Array.isArray(models) ? models.join("\n") : "");
                    return (
                      <div
                        key={provider}
                        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/70"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="font-mono text-xs text-slate-900 dark:text-white">{provider}</p>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => void saveExcludedProvider(provider, excludedDraft[provider] ?? text)}
                              disabled={isPending}
                            >
                              保存
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => void deleteExcludedProvider(provider)}
                              disabled={isPending}
                            >
                              删除
                            </Button>
                          </div>
                        </div>
                        <textarea
                          value={excludedDraft[provider] ?? text}
                          onChange={(e) => {
                            const nextText = e.currentTarget.value;
                            setExcludedDraft((prev) => ({ ...prev, [provider]: nextText }));
                          }}
                          placeholder="每行一个模型；使用 * 可禁用全部模型"
                          aria-label={`${provider} 排除模型`}
                          className="mt-3 min-h-[120px] w-full resize-y rounded-2xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 outline-none transition placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-slate-400/35 dark:border-neutral-800 dark:bg-neutral-950 dark:text-slate-100 dark:placeholder:text-neutral-500 dark:focus-visible:ring-white/15"
                        />
                      </div>
                    );
                  })
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="alias">
          <Card
            title="OAuth 模型别名"
            description="按 channel 维护模型 name -> alias 映射（用于 OAuth 场景）。"
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => void refreshAlias()} disabled={aliasLoading || isPending}>
                  <RefreshCw size={14} className={aliasLoading ? "animate-spin" : ""} />
                  刷新
                </Button>
              </div>
            }
            loading={aliasLoading}
          >
            <div className="flex flex-wrap items-center gap-2">
              <TextInput
                value={aliasNewChannel}
                onChange={(e) => setAliasNewChannel(e.currentTarget.value)}
                placeholder="新增 channel（如 codex / gemini / anthropic）"
              />
              <Button variant="primary" size="sm" onClick={addAliasChannel} disabled={isPending}>
                新增
              </Button>
            </div>

            <div className="mt-4 space-y-3">
              {Object.keys(aliasEditing).length === 0 ? (
                <EmptyState title="暂无配置" description="你可以新增一个 channel 并维护映射。" />
              ) : (
                Object.keys(aliasEditing)
                  .sort((a, b) => a.localeCompare(b))
                  .map((channel) => {
                    const rows = aliasEditing[channel] ?? buildAliasRows([]);
                    return (
                      <div
                        key={channel}
                        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/70"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="font-mono text-xs text-slate-900 dark:text-white">{channel}</p>
                          <div className="flex items-center gap-2">
                            <Button variant="secondary" size="sm" onClick={() => void saveAliasChannel(channel)} disabled={isPending}>
                              保存
                            </Button>
                            <Button variant="danger" size="sm" onClick={() => void deleteAliasChannel(channel)} disabled={isPending}>
                              删除
                            </Button>
                          </div>
                        </div>

                        <div className="mt-3 space-y-2">
                          {rows.map((row, idx) => (
                            <div key={row.id} className="grid gap-2 md:grid-cols-12">
                              <div className="md:col-span-5">
                                <TextInput
                                  value={row.name}
                                  onChange={(e) => {
                                    const value = e.currentTarget.value;
                                    setAliasEditing((prev) => ({
                                      ...prev,
                                      [channel]: prev[channel].map((it, i) => (i === idx ? { ...it, name: value } : it)),
                                    }));
                                  }}
                                  placeholder="name"
                                />
                              </div>
                              <div className="md:col-span-5">
                                <TextInput
                                  value={row.alias}
                                  onChange={(e) => {
                                    const value = e.currentTarget.value;
                                    setAliasEditing((prev) => ({
                                      ...prev,
                                      [channel]: prev[channel].map((it, i) => (i === idx ? { ...it, alias: value } : it)),
                                    }));
                                  }}
                                  placeholder="alias"
                                />
                              </div>
                              <label className="md:col-span-2 flex cursor-pointer items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
                                <span className="text-xs text-slate-600 dark:text-white/65">fork</span>
                                <input
                                  type="checkbox"
                                  checked={Boolean(row.fork)}
                                  onChange={(e) => {
                                    const checked = e.currentTarget.checked;
                                    setAliasEditing((prev) => ({
                                      ...prev,
                                      [channel]: prev[channel].map((it, i) => (i === idx ? { ...it, fork: checked } : it)),
                                    }));
                                  }}
                                  className="h-4 w-4 rounded border-slate-300 text-slate-900 focus-visible:ring-2 focus-visible:ring-slate-400/35 dark:border-neutral-700 dark:bg-neutral-950 dark:text-white dark:focus-visible:ring-white/15"
                                />
                              </label>
                            </div>
                          ))}

                          <div className="flex items-center gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                setAliasEditing((prev) => ({
                                  ...prev,
                                  [channel]: [
                                    ...(prev[channel] ?? []),
                                    { id: `row-${Date.now()}`, name: "", alias: "" },
                                  ],
                                }));
                              }}
                            >
                              新增一行
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <Modal
        open={detailOpen}
        title={detailFile ? `查看：${detailFile.name}` : "查看认证文件"}
        onClose={() => setDetailOpen(false)}
        footer={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                if (detailFile) {
                  downloadTextAsFile(detailText, detailFile.name);
                }
              }}
              disabled={!detailFile || detailLoading}
            >
              <Download size={14} />
              下载
            </Button>
            <Button variant="secondary" onClick={() => setDetailOpen(false)}>
              关闭
            </Button>
          </div>
        }
      >
        {detailLoading ? (
          <div className="text-sm text-slate-600 dark:text-white/65">加载中…</div>
        ) : (
          <pre className="whitespace-pre-wrap break-words rounded-2xl border border-slate-200 bg-white p-4 font-mono text-xs text-slate-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-slate-100">
            {detailText || "--"}
          </pre>
        )}
      </Modal>

      <Modal
        open={modelsOpen}
        title={`模型列表：${modelsFileName || "--"}`}
        onClose={() => setModelsOpen(false)}
        footer={<Button variant="secondary" onClick={() => setModelsOpen(false)}>关闭</Button>}
      >
        {modelsLoading ? (
          <div className="text-sm text-slate-600 dark:text-white/65">加载中…</div>
        ) : modelsList.length === 0 ? (
          <EmptyState title="暂无模型数据" description="该认证文件可能不支持查询模型列表，或服务端未实现相关接口。" />
        ) : (
          <div className="space-y-2">
            {modelsList.map((model) => (
              <div
                key={model.id}
                className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60"
              >
                <p className="font-mono text-xs text-slate-900 dark:text-white">{model.id}</p>
                <p className="mt-1 text-xs text-slate-600 dark:text-white/65">
                  {model.display_name ? `display_name：${model.display_name}` : ""}
                  {model.owned_by ? ` · owned_by：${model.owned_by}` : ""}
                </p>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={confirm !== null}
        title={confirm?.type === "deleteAll" ? "删除全部认证文件" : "删除认证文件"}
        description={
          confirm?.type === "deleteAll"
            ? "确定要删除所有认证文件吗？此操作不可恢复。"
            : `确定要删除 ${confirm?.type === "deleteFile" ? confirm.name : ""} 吗？此操作不可恢复。`
        }
        confirmText="删除"
        busy={deletingAll}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          const action = confirm;
          if (!action) return;
          if (action.type === "deleteAll") {
            void handleDeleteAll().finally(() => setConfirm(null));
            return;
          }
          void handleDelete(action.name).finally(() => setConfirm(null));
        }}
      />
    </div>
  );
}
